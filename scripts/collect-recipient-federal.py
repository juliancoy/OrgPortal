#!/usr/bin/env python3
"""Retain resumable official recipient transaction exports from FY2008 onward.

This collects source files only. Publication requires separate normalization,
identity review, exact source-count reconciliation and preview/apply receipts.
"""
import argparse, datetime, hashlib, importlib.util, json, pathlib, time, os

spec=importlib.util.spec_from_file_location('federal',pathlib.Path(__file__).with_name('collect-usaspending.py'))
federal=importlib.util.module_from_spec(spec);spec.loader.exec_module(federal)

def collect(out,recipient):
    out.mkdir(parents=True,exist_ok=True,mode=0o700)
    today=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    # A resume after UTC midnight must retain the original source window.
    existing=out/'2018-current-contracts-request.json'
    if existing.exists():today=json.loads(existing.read_text())['request']['filters']['time_period'][0]['end_date']
    windows=[('2008-2017','2007-10-01','2017-09-30','search'),
             ('2018-current','2017-10-01',today,'search')]
    manifest=[]
    for label,start,end,endpoint in windows:
        for family,(codes,columns) in federal.FAMILIES.items():
            prefix=f'{label}-{family}';receipt=out/(prefix+'-request.json')
            payload={'filters':{'recipient_search_text':[recipient],'time_period':[{'start_date':start,'end_date':end}],
                       'award_type_codes':codes},'columns':federal.COMMON_COLUMNS+columns+['recipient_duns'],
                       'file_format':'csv','spending_level':['transactions']}
            if receipt.exists():
                job=json.loads(receipt.read_text())
                if job['request']!=payload:raise ValueError('Source request changed; use a fresh directory')
            else:
                job={'requestedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'request':payload,
                     'endpoint':endpoint,'response':federal.request('POST',federal.BASE+'/download/'+endpoint+'/',json=payload).json()}
                federal.save(receipt,job)
            archive=out/(prefix+'.zip');status_path=out/(prefix+'-status.json')
            if not archive.exists():
                deadline=time.monotonic()+3600
                while True:
                    status=federal.request('GET',job['response']['status_url']).json();federal.save(status_path,status)
                    if status['status']=='finished':break
                    if status['status']=='failed' or time.monotonic()>deadline:raise ValueError('Download failed or timed out: '+prefix)
                    time.sleep(5)
                with federal.request('GET',job['response']['file_url'],stream=True) as response:
                    temp=archive.with_suffix('.tmp')
                    with temp.open('wb') as f:
                        for block in response.iter_content(1024*1024):f.write(block)
                    os.chmod(temp,0o600);temp.replace(archive)
            status=json.loads(status_path.read_text())
            item={'file':archive.name,'sha256':hashlib.file_digest(archive.open('rb'),'sha256').hexdigest(),
                  'status':status,'request':job['request'],'requestedAt':job['requestedAt']}
            manifest.append(item);federal.save(out/'manifest.partial.json',manifest)
            print(json.dumps({'source':prefix,'status':status.get('status'),'rows':status.get('total_rows'),'bytes':archive.stat().st_size}),flush=True)
    federal.save(out/'manifest.json',{'recipientQuery':recipient,'sources':manifest,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',required=True,type=pathlib.Path);p.add_argument('--recipient',required=True);a=p.parse_args();collect(a.output,a.recipient)
