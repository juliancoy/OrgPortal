#!/usr/bin/env python3
"""Reconcile rejected download rows against their exact original ZIP/CSV records.

Missing names are explicit, never guessed. Source-selected records whose exported
geography disagrees with Maryland stay separate from verified Maryland rows.
"""
import argparse,csv,hashlib,importlib.util,io,json,pathlib,re,zipfile
spec=importlib.util.spec_from_file_location('collector',pathlib.Path(__file__).with_name('collect-usaspending.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def review(inputs,out):
 out.mkdir(parents=True,exist_ok=True,mode=0o700);native={};outside={};nodes={};remaining=[];sources=[]
 for item in inputs:
  folder=pathlib.Path(item['source']);quarantine=pathlib.Path(item['quarantine']);manifest=json.loads((folder/'manifest.json').read_text());byfile={s['file']:s for s in manifest['sources']};groups={}
  with quarantine.open() as f:
   for line in f:
    entry=json.loads(line);groups.setdefault(entry.get('sourceFile',entry.get('file')),[]).append(entry)
  for filename,entries in groups.items():
   source=byfile[filename];archive=folder/filename
   with archive.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
   if sha!=source['sha256'] or any(e['sourceSha256']!=sha for e in entries):raise ValueError('Quarantine source checksum differs')
   wanted={(e['csvFile'],e['rowNumber']):e for e in entries};count=verified=recovered=mismatched=0
   with zipfile.ZipFile(archive) as z:
    for name in z.namelist():
     if not name.endswith('.csv'):continue
     with z.open(name) as f:
      for raw in csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig')):
       count+=1;entry=wanted.pop((name,count),None)
       if not entry:continue
       if raw!=entry['row']:raise ValueError('Quarantine row differs from original source')
       verified+=1
       try:row=m.normalize(raw,source['requestedAt'],sha,require_maryland=False)
       except (ValueError,KeyError) as error:remaining.append({'sourceFile':filename,'rowNumber':count,'reason':str(error)});continue
       md=any(row['metadata'][prefix+'_state_code']=='MD' and row['metadata'][prefix+'_country_code'] in ['', 'USA'] for prefix in ['recipient','primary_place_of_performance'])
       destination=native if md else outside
       if md:recovered+=1
       else:mismatched+=1
       prior=destination.get(row['id'])
       if prior and {k:v for k,v in prior.items() if k not in ['source_sha256','retrieved_at']}!={k:v for k,v in row.items() if k not in ['source_sha256','retrieved_at']}:raise ValueError('Conflicting quarantine revisions')
       destination.setdefault(row['id'],row)
       if not wanted:break
     if not wanted:break
   if wanted:raise ValueError('Quarantine rows missing from original archive')
   sources.append({'file':filename,'sourceSha256':sha,'verifiedRows':verified,'recoveredMarylandRows':recovered,'geographyMismatchRows':mismatched});print(filename,verified,recovered,mismatched,flush=True)
 observations=out/'observations.jsonl'
 with observations.open('w') as f:
  for row in sorted(native.values(),key=lambda row:row['id']):f.write(m.canonical(row)+'\n')
 observations.chmod(0o600)
 relations=[]
 for row in outside.values():
  meta=row['metadata'];code=meta['awarding_agency_code'];uei=meta['recipient_uei']
  aid='usgov:agency:'+code if code else 'source-label:usaspending:agency:'+m.digest(row['agency_label'].encode())[:32]
  rid='usgov:recipient:'+uei if re.fullmatch(r'[A-Z0-9]{12}',uei) else 'source-label:usaspending:recipient:'+m.digest(row['recipient_label'].encode())[:32]
  for identifier,label,category in [(aid,row['agency_label'],'government'),(rid,row['recipient_label'],'general')]:
   nodes.setdefault(identifier,{'id':identifier,'name':label,'type':'Organization' if identifier.startswith('usgov:') else 'Source label','category':category,'entityType':'organization' if identifier.startswith('usgov:') else 'source_label','identityStatus':'source_linked' if identifier.startswith('usgov:') else 'unverified_label','directory':False,'sourceCategory':'usaspending'})
  relations.append({'id':row['id'],'source':aid,'target':rid,'sourceLabel':row['agency_label'],'targetLabel':row['recipient_label'],'kind':'obligation','relationship':'funding','financialFactType':'obligation','financialMeasure':'delta','measurement':'delta','amount':row['amount_cents']/100,'currency':'USD','date':row['occurred_at'],'fiscalYear':int(meta['fiscal_year']),'fiscalCalendar':'federal','description':row['description'],'type':'Federal obligation — source geography discrepancy','sourceUrl':row['source_url'],'sourceSystem':'usaspending','sourceDataset':'prime_transactions','evidence':'USAspending Maryland-filtered download; exported geography differs','sourceRecordType':'external_financial_observation','transactionRecordId':row['id'],'status':'reported','retrievedAt':row['retrieved_at'],'notes':'Signed obligation, not cash. The official Maryland-filtered export included this transaction but neither exported recipient nor performance geography verifies Maryland. Source geography is preserved, not changed.','provenance':{**meta,'sourceSha256':row['source_sha256'],'selection':'Maryland recipient OR place of performance download','marylandGeographyVerified':False}})
 additions={'organizations':list(nodes.values()),'relationships':sorted(relations,key=lambda r:r['id']),'metadata':[{'id':'data:marylandSourceGeographyDiscrepancies:'+m.digest(m.canonical(sources).encode())[:20],'value':{'sources':sources,'records':len(relations),'scope':'Source-selected Maryland download rows with conflicting exported geography; not proof of Maryland location.'}}]}
 target=out/'geography-additions.json';target.write_text(json.dumps(additions,separators=(',',':'))+'\n');target.chmod(0o600)
 report={'recoveredMaryland':len(native),'sourceGeographyDiscrepancies':len(outside),'remaining':remaining,'sources':sources,'observationsSha256':hashlib.sha256(observations.read_bytes()).hexdigest(),'additionsSha256':hashlib.sha256(target.read_bytes()).hexdigest()};m.save(out/'review.json',report);print(json.dumps({k:v for k,v in report.items() if k!='sources'}))
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--inputs',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args();review(json.loads(a.inputs.read_text()),a.output)
