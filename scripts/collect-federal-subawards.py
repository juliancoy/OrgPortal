#!/usr/bin/env python3
"""Retain official Maryland subaward evidence separately from prime obligations.

Original exports and checksums are private review artifacts. This collector does
not publish records or count pass-through amounts as additional federal funding.
"""
import argparse,csv,datetime,hashlib,importlib.util,io,json,os,pathlib,time,zipfile
spec=importlib.util.spec_from_file_location('federal',pathlib.Path(__file__).with_name('collect-usaspending.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
COLUMNS=['prime_award_unique_key','prime_awardee_name','prime_awardee_uei','prime_awardee_duns',
 'prime_awardee_state_code','prime_awardee_country_code','prime_award_awarding_agency_code','prime_award_awarding_agency_name',
 'subaward_type','subaward_sam_report_id','subaward_sam_report_year','subaward_sam_report_month','subaward_number',
 'subaward_amount','subaward_action_date','subaward_action_date_fiscal_year','subawardee_uei','subawardee_duns','subawardee_name',
 'subawardee_country_code','subawardee_state_code','subaward_primary_place_of_performance_state_code',
 'subaward_primary_place_of_performance_country_code','subaward_description','usaspending_permalink','subaward_sam_report_last_modified_date']

def collect(out,all_years=False):
 out.mkdir(parents=True,exist_ok=True,mode=0o700);manifest=[]
 for scope in ['recipient','place_of_performance']:
  for family,codes in [('subcontracts',['A','B','C','D']),('subgrants',['02','03','04','05'])]:
   prefix=scope+'-'+family;receipt=out/(prefix+'-request.json')
   if receipt.exists():job=json.loads(receipt.read_text())
   else:
    filters={'award_type_codes':codes,scope+'_locations':[{'country':'USA','state':'MD'}],
     'time_period':[{'start_date':'2007-10-01','end_date':datetime.datetime.now(datetime.timezone.utc).date().isoformat()}]}
    if all_years:filters.pop('time_period')
    count=m.request('POST',m.BASE+'/search/spending_by_award_count/',json={'filters':filters,'subawards':True}).json()
    expected=sum(count['results'].values())
    if expected>=500000:raise ValueError('Partition subawards before collection: source download cap')
    payload={'filters':filters,'spending_level':['subawards'],'columns':COLUMNS,'file_format':'csv'}
    job={'request':payload,'searchCount':expected,'requestedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
     'response':m.request('POST',m.BASE+'/download/search/',json=payload).json()};m.save(receipt,job)
   archive=out/(prefix+'.zip');status_path=out/(prefix+'-status.json')
   if not archive.exists():
    deadline=time.monotonic()+1800
    while True:
     status=m.request('GET',job['response']['status_url']).json();m.save(status_path,status)
     if status['status']=='finished':break
     if status['status']=='failed' or time.monotonic()>deadline:raise ValueError('Subaward source unavailable: '+prefix)
     time.sleep(10)
    with m.request('GET',job['response']['file_url'],stream=True) as response:
     temp=archive.with_suffix('.part')
     with temp.open('wb') as f:
      for block in response.iter_content(1024*1024):f.write(block)
     temp.chmod(0o600);temp.replace(archive)
   count=0
   with zipfile.ZipFile(archive) as z:
    for name in z.namelist():
     if name.endswith('.csv'):
      with z.open(name) as f:count+=sum(1 for _ in csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig')))
   status=json.loads(status_path.read_text())
   if status.get('status')!='finished' or status.get('total_rows')!=count:raise ValueError('Subaward export count mismatch')
   with archive.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
   manifest.append({'file':archive.name,'sha256':sha,'records':count,'scope':scope,'family':family,
    'requestedAt':job['requestedAt'],'request':job['request'],'searchCount':job['searchCount']})
   m.save(out/'manifest.partial.json',{'sources':manifest});print(prefix,count,flush=True)
 m.save(out/'manifest.json',{'sources':manifest,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'limitations':['Subawards are reported pass-through awards; do not add to prime obligations or cash transfers.','Source reporting thresholds, lags and amendments apply.']})
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',required=True,type=pathlib.Path);p.add_argument('--all-years',action='store_true');a=p.parse_args();collect(a.output,a.all_years)
