#!/usr/bin/env python3
"""Collect public IRS e-file views and filing indexes for explicitly selected EINs.

Full source documents stay private. Extracted publication fields are limited to
organization financial statements. Each document retains its checksum and URL.
"""
import argparse,concurrent.futures,datetime,hashlib,json,pathlib,re,sys,time
import requests
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'web/scripts/lib'))
from rendered_990_statement import Fields,normalize_rendered_statement
from legacy_990_statement import normalize_legacy_statement

def get(url,path):
    if path.exists():return path.read_bytes()
    for attempt in range(4):
        try:
            r=requests.get(url,timeout=(15,90));r.raise_for_status();path.write_bytes(r.content);path.chmod(0o600);return r.content
        except requests.RequestException:
            if attempt==3:raise
            time.sleep(2**attempt)

def collect(out,eins):
    out.mkdir(parents=True,exist_ok=True,mode=0o700);jobs=[];indexes=[]
    for ein in eins:
        url=f'https://projects.propublica.org/nonprofits/organizations/{ein}'
        raw=get(url,out/(ein+'.html'))
        ids=sorted(set(re.findall(r'/'+ein+r'/(\d{18})/full',raw.decode())))
        # 349 is the IRS Form 990 submission type. 339 links are 990-T returns,
        # retained in the index but never mistaken for another annual statement.
        jobs.extend((ein,filing) for filing in ids if filing[9:12]=='349')
        api_url=f'https://projects.propublica.org/nonprofits/api/v2/organizations/{ein}.json'
        api=get(api_url,out/(ein+'-index.json'))
        indexes.append({'ein':ein,'sourceUrl':url,'sha256':hashlib.sha256(raw).hexdigest(),'apiUrl':api_url,
                        'apiSha256':hashlib.sha256(api).hexdigest(),'filingIds':ids})
    def filing(job):
        ein,oid=job;url=f'https://projects.propublica.org/nonprofits/full_text/{oid}/IRS990'
        path=out/(oid+'-IRS990.html');raw=get(url,path);fields=Fields();fields.feed(raw.decode())
        header='/AppData/SubmissionHeaderAndDocument/ReturnHeader[1]/'
        legacy=header+'TaxPeriodEndDt[1]' not in fields.fields
        end=datetime.datetime.strptime(fields.fields[header+('TaxPeriodEndDate[1]' if legacy else 'TaxPeriodEndDt[1]')].strip(),'%m-%d-%Y').date().isoformat()
        summary=(normalize_legacy_statement if legacy else normalize_rendered_statement)(raw,{'EIN':ein,'OBJECT_ID':oid,'TAX_PERIOD':end.replace('-','')[:6]},url,datetime.datetime.now(datetime.timezone.utc).isoformat())
        # Keep amendment and source header fields explicit if present.
        prefix='/AppData/SubmissionHeaderAndDocument/SubmissionDocument/IRS990[1]/'
        for k in ['AmendedReturnInd[1]','AmendedReturnBoxInd[1]']:
            if prefix+k in fields.fields:summary['amended']=fields.fields[prefix+k]=='1'
        (out/(oid+'-summary.json')).write_text(json.dumps(summary,indent=2)+'\n')
        return {'ein':ein,'id':oid,'periodEnd':end,'file':path.name,'sha256':summary['sourceSha256'],
                'reconciled':all(v['reconciled'] for v in summary['statements'].values()),'amended':summary['amended']}
    results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(filing,jobs):
            results.append(result);print(json.dumps(result),flush=True)
            (out/'manifest.partial.json').write_text(json.dumps({'indexes':indexes,'filings':results},indent=2)+'\n')
    (out/'manifest.json').write_text(json.dumps({'indexes':indexes,'filings':results},indent=2)+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',required=True,type=pathlib.Path);p.add_argument('--eins',nargs='+',required=True);a=p.parse_args();collect(a.output,a.eins)
