#!/usr/bin/env python3
"""Preserve reported subaward observations without adding pass-through totals.

SAM report IDs distinguish source observations. Repeated reports for one
subaward are not cash transactions and never join additive award/cash totals.
"""
import argparse,csv,datetime,hashlib,importlib.util,io,json,pathlib,re,zipfile
from decimal import Decimal
spec=importlib.util.spec_from_file_location('source',pathlib.Path(__file__).with_name('collect-usaspending.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def normalize(raw,retrieved,sha):
 report=raw.get('subaward_sam_report_id','');kind=raw.get('subaward_type','');award=raw.get('prime_award_unique_key','')
 if not report or not award or kind not in ['sub-grant','sub-contract']:raise ValueError('Missing stable subaward source identity')
 date=datetime.date.fromisoformat(raw['subaward_action_date']);amount=Decimal(raw['subaward_amount'])*100
 if not amount.is_finite() or amount!=amount.to_integral_value() or abs(amount)>9007199254740991:raise ValueError('Invalid reported subaward amount')
 source=m.official(raw['usaspending_permalink'])
 if not source.startswith('https://www.usaspending.gov/award/'):raise ValueError('Missing primary award evidence URL')
 if 'MD' not in [raw.get('subawardee_state_code'),raw.get('subaward_primary_place_of_performance_state_code'),raw.get('prime_awardee_state_code')]:raise ValueError('Subaward outside Maryland selection')
 nodes=[]
 for prefix in ['prime_awardee','subawardee']:
  name=raw.get(prefix+'_name','').strip();uei=raw.get(prefix+'_uei','').strip()
  reported=bool(name);valid_uei=bool(re.fullmatch(r'[A-Z0-9]{12}',uei))
  if not name:name=('Prime recipient not reported (award '+award+')') if prefix=='prime_awardee' else ('Subrecipient not reported (report '+report+')')
  identifier='usgov:recipient:'+uei if re.fullmatch(r'[A-Z0-9]{12}',uei) else 'source-label:usaspending:recipient:'+m.digest(name.encode())[:32]
  nodes.append({'id':identifier,'name':name,'type':'Organization' if valid_uei else 'Source label','category':'general','entityType':'organization' if valid_uei else 'source_label',
   'identityStatus':'source_linked' if valid_uei else 'unverified_label','directory':False,'sourceCategory':'usaspending','nameReported':reported,'identifiers':{'uei':uei} if valid_uei else {}})
 record={'id':'usaspending:subaward:'+m.digest((kind+':'+report).encode()),'source':nodes[0]['id'],'target':nodes[1]['id'],
  'sourceLabel':nodes[0]['name'],'targetLabel':nodes[1]['name'],'kind':'reported_award','relationship':'funding','financialFactType':'reported_award',
  'financialMeasure':'snapshot','measurement':'snapshot','annualAmountEligible':False,'amount':int(amount)/100,'currency':'USD',
  'date':date.isoformat(),'fiscalYear':date.year+(date.month>=10),'fiscalCalendar':'federal','description':raw.get('subaward_description',''),
  'type':'Reported federal '+kind,'sourceUrl':source,'sourceSystem':'usaspending','sourceDataset':'subawards','evidence':'USAspending / SAM subaward report',
  'status':'reported','retrievedAt':retrieved,'notes':'Reported pass-through subaward observation, not a payment or additional prime funding. Multiple reports may describe the same subaward; inspect individual reports instead of adding them.',
  'provenance':{key:raw.get(key,'') for key in ['prime_award_unique_key','prime_awardee_uei','prime_awardee_duns','prime_awardee_state_code',
   'prime_award_awarding_agency_code','prime_award_awarding_agency_name','subaward_sam_report_id','subaward_sam_report_year','subaward_sam_report_month',
   'subaward_number','subawardee_uei','subawardee_duns','subawardee_state_code','subaward_primary_place_of_performance_state_code','subaward_sam_report_last_modified_date']}}
 record['provenance']['sourceSha256']=sha
 return nodes,record

def prepare(source,out):
 manifest=json.loads((source/'manifest.json').read_text());nodes={};records={};review=[];rejected=[]
 for item in manifest['sources']:
  archive=source/item['file']
  with archive.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
  if sha!=item['sha256']:raise ValueError('Source checksum mismatch')
  status=json.loads((source/(archive.stem+'-status.json')).read_text())
  if status.get('status')!='finished':raise ValueError('Incomplete subaward source')
  count=duplicate=quarantined=0
  with zipfile.ZipFile(archive) as z:
   for name in z.namelist():
    if not name.endswith('.csv'):continue
    with z.open(name) as f:
     for raw in csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig')):
      count+=1
      try:entities,row=normalize(raw,item['requestedAt'],sha)
      except (ValueError,KeyError) as error:rejected.append({'file':archive.name,'sha256':sha,'csvFile':name,'rowNumber':count,'reason':str(error),'row':raw});quarantined+=1;continue
      for node in entities:nodes.setdefault(node['id'],node)
      old=records.get(row['id'])
      if old:
       comparable=lambda r:{k:v for k,v in r.items() if k not in ['retrievedAt','provenance']}|{'provenance':{k:v for k,v in r['provenance'].items() if k!='sourceSha256'}}
       if comparable(old)!=comparable(row):raise ValueError('Conflicting subaward report: '+row['id'])
       duplicate+=1
      else:records[row['id']]=row
  if count!=item['records'] or count!=status.get('total_rows'):raise ValueError('Subaward count mismatch')
  review.append({**item,'duplicates':duplicate,'quarantinedRecords':quarantined});print(archive.name,count,duplicate,quarantined,flush=True)
 result={'organizations':list(nodes.values()),'relationships':sorted(records.values(),key=lambda r:r['id']),'metadata':[{
  'id':'data:marylandSubawards:'+m.digest(m.canonical(review).encode())[:20],'value':{'sources':review,'records':len(records),'nonAdditive':True,
   'scope':'Maryland-related subaward reports. Monthly reports and amendments are retained as distinct observations; not added to cash, prime obligations or annual awards.'}}]}
 out.write_text(json.dumps(result,separators=(',',':'))+'\n');out.chmod(0o600)
 quarantine=out.with_suffix('.quarantine.json');quarantine.write_text(json.dumps(rejected)+'\n');quarantine.chmod(0o600)
 report={'records':len(records),'nodes':len(nodes),'quarantined':len(rejected),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'sources':review}
 m.save(out.with_suffix('.review.json'),report);print(json.dumps({k:v for k,v in report.items() if k!='sources'}))
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True,type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);a=p.parse_args();prepare(a.source,a.output)
