#!/usr/bin/env python3
"""Normalize reviewed bulk transaction archives, with disk-backed deduplication.

Only completed exports whose hashes and row counts reconcile are accepted.
Rejected rows remain in a private quarantine file and are excluded from totals.
"""
import argparse,csv,datetime,hashlib,importlib.util,io,json,pathlib,sqlite3,zipfile
from contextlib import closing
from decimal import DecimalException
spec=importlib.util.spec_from_file_location('source',pathlib.Path(__file__).with_name('collect-usaspending.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def prepare(source,out):
 manifest=json.loads((source/'manifest.json').read_text());out.mkdir(parents=True,exist_ok=True,mode=0o700)
 review=[];quarantine=out/'quarantine.jsonl';quarantine.write_text('');quarantine.chmod(0o600)
 with closing(sqlite3.connect(out/'staging.sqlite')) as db:
  db.execute('CREATE TABLE IF NOT EXISTS transactions(id TEXT PRIMARY KEY,payload TEXT NOT NULL,content_hash TEXT NOT NULL)');db.execute('DELETE FROM transactions')
  for item in manifest['sources']:
   archive=source/item['file']
   with archive.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
   if sha!=item['sha256']:raise ValueError('Bulk source checksum changed')
   status=json.loads((source/(archive.stem+'-status.json')).read_text())
   if status.get('status')!='finished':raise ValueError('Bulk source is not complete')
   start=item['request']['filters']['date_range']['start_date'];end=item['request']['filters']['date_range']['end_date']
   count=duplicate=rejected=0
   with zipfile.ZipFile(archive) as z:
    for name in z.namelist():
     if not name.endswith('.csv'):continue
     with z.open(name) as f:
      for raw in csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig')):
       count+=1
       try:
        row=m.normalize(raw,item['requestedAt'],sha)
        if not start<=row['occurred_at']<=end:raise ValueError('Transaction outside requested action-date period')
       except (ValueError,KeyError,DecimalException) as error:
        with quarantine.open('a') as q:q.write(m.canonical({'file':archive.name,'sourceSha256':sha,'csvFile':name,'rowNumber':count,'reason':str(error),'row':raw})+'\n')
        rejected+=1;continue
       content=m.digest(m.canonical({k:v for k,v in row.items() if k not in ['source_sha256','retrieved_at']}).encode())
       old=db.execute('SELECT content_hash FROM transactions WHERE id=?',(row['id'],)).fetchone()
       if old:
        if old[0]!=content:raise ValueError('Conflicting bulk transaction: '+row['id'])
        duplicate+=1
       else:db.execute('INSERT INTO transactions VALUES(?,?,?)',(row['id'],m.canonical(row),content))
   if count!=item['records'] or count!=status.get('total_rows'):raise ValueError('Bulk row count mismatch')
   db.commit();review.append({**item,'duplicates':duplicate,'quarantinedRecords':rejected,'normalizedRecords':count-rejected})
   print(archive.name,count,'rows;',duplicate,'duplicates;',rejected,'quarantined',flush=True)
   m.save(out/'manifest.partial.json',{'sources':review})
  totals={};count=0;observations=out/'observations.jsonl'
  with observations.open('w') as f:
   for payload, in db.execute('SELECT payload FROM transactions ORDER BY id'):
    f.write(payload+'\n');count+=1;row=json.loads(payload);year=row['metadata']['fiscal_year'];v=totals.setdefault(year,{'records':0,'amount_cents':0});v['records']+=1;v['amount_cents']+=row['amount_cents']
  observations.chmod(0o600)
  with observations.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
  result={'records':count,'totals':totals,'sha256':sha,'sources':review,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
   'limitations':['Signed federal obligations, not cash disbursements.','Rejected source rows are retained for review and not counted as imported.']}
  m.save(out/'manifest.json',result);print(json.dumps({k:v for k,v in result.items() if k!='sources'}),flush=True)
 (out/'staging.sqlite').chmod(0o600)
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True,type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);a=p.parse_args();prepare(a.source,a.output)
