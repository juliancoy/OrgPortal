#!/usr/bin/env python3
"""Resume official Maryland bulk exports. Retain requests, status and checksums."""
import argparse,datetime,hashlib,importlib.util,json,pathlib,time,os,csv,io,zipfile
spec=importlib.util.spec_from_file_location('source',pathlib.Path(__file__).with_name('collect-usaspending.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def collect(out,years):
    out.mkdir(parents=True,exist_ok=True,mode=0o700);jobs=[]
    for year in years:
        for scope in ['recipient','place_of_performance']:
            for family,(codes,columns) in m.FAMILIES.items():
                prefix=f'fy{year}-{scope}-{family}';path=out/(prefix+'-request.json')
                filters={'agencies':[{'type':'awarding','tier':'toptier','name':'all'}],
                    'prime_award_types':codes,'date_type':'action_date','date_range':{'start_date':f'{year-1}-10-01','end_date':f'{year}-09-30'},
                    scope+'_locations':[{'country':'USA','state':'MD'}]}
                payload={'filters':filters,'columns':m.COMMON_COLUMNS+columns,'file_format':'csv'}
                if path.exists():
                    job=json.loads(path.read_text())
                    if job['request']!=payload:raise ValueError('Changed bulk request')
                else:
                    job={'requestedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'request':payload,
                        'response':m.request('POST',m.BASE+'/bulk_download/awards/',json=payload).json()};m.save(path,job)
                    print('queued',prefix,flush=True);time.sleep(2)
                jobs.append((prefix,job))
    manifest=[]
    for prefix,job in jobs:
        archive=out/(prefix+'.zip');status_path=out/(prefix+'-status.json');deadline=time.monotonic()+3600
        if not archive.exists():
            while True:
                status=m.request('GET',job['response']['status_url']).json();m.save(status_path,status)
                if status['status']=='finished':break
                if status['status']=='failed' or time.monotonic()>deadline:raise ValueError('Bulk source unavailable: '+prefix)
                time.sleep(5)
            with m.request('GET',job['response']['file_url'],stream=True) as response:
                temp=archive.with_suffix('.tmp')
                with temp.open('wb') as f:
                    for block in response.iter_content(1024*1024):f.write(block)
                os.chmod(temp,0o600);temp.replace(archive)
        count=0
        with zipfile.ZipFile(archive) as z:
            for name in z.namelist():
                if name.endswith('.csv'):
                    with z.open(name) as f:count+=sum(1 for _ in csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig')))
        status=json.loads(status_path.read_text())
        if status.get('total_rows')!=count:raise ValueError('Bulk count mismatch '+prefix)
        manifest.append({'file':archive.name,'records':count,'sha256':hashlib.file_digest(archive.open('rb'),'sha256').hexdigest(),
                         'requestedAt':job['requestedAt'],'request':job['request']})
        m.save(out/'manifest.partial.json',{'sources':manifest});print('downloaded',prefix,count,flush=True)
    m.save(out/'manifest.json',{'sources':manifest,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',required=True,type=pathlib.Path);p.add_argument('--years',nargs='+',required=True,type=int);a=p.parse_args();collect(a.output,a.years)
