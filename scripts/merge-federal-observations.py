#!/usr/bin/env python3
"""Merge sorted, checksum-pinned federal observations without changing prior rows.

The first input is the published baseline. Equal IDs must agree on source facts;
only retrieval timestamps and archive checksums may differ. Conflicting source
revisions are retained privately for review and prevent publication of a union.
"""
import argparse,contextlib,datetime,hashlib,heapq,json,pathlib

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def facts(row):return {k:v for k,v in row.items() if k not in ['source_sha256','retrieved_at']}
def merge(inputs,output):
 output.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 for item in inputs:
  with pathlib.Path(item['file']).open('rb') as f:actual=hashlib.file_digest(f,'sha256').hexdigest()
  if actual!=item['sha256']:raise ValueError('Input checksum mismatch: '+item['file'])
 partial=output.with_suffix('.partial');conflicts=output.with_suffix('.conflicts.jsonl');totals={};sources={};review=[{**item,'records':0,'duplicates':0,'retained':0} for item in inputs];conflict_count=count=0
 def rows(f,index):
  previous=''
  for line in f:
   if not line.strip():continue
   row=json.loads(line)
   if row['id']<=previous:raise ValueError('Unsorted or duplicate input ID: '+inputs[index]['file'])
   previous=row['id'];review[index]['records']+=1
   yield row['id'],index,row
 with contextlib.ExitStack() as stack:
  files=[stack.enter_context(pathlib.Path(item['file']).open()) for item in inputs]
  out=stack.enter_context(partial.open('w'));partial.chmod(0o600)
  rejected=stack.enter_context(conflicts.open('w'));conflicts.chmod(0o600)
  previous=None
  for identifier,index,row in heapq.merge(*(rows(f,i) for i,f in enumerate(files)),key=lambda value:(value[0],value[1])):
   if previous and identifier==previous['id']:
    review[index]['duplicates']+=1
    if facts(previous)!=facts(row):
     rejected.write(canonical({'id':identifier,'retained':previous,'candidate':row,'candidateInput':index})+'\n');conflict_count+=1
    continue
   previous=row;out.write(canonical(row)+'\n');count+=1;review[index]['retained']+=1
   fiscal=str(row['metadata']['fiscal_year']);total=totals.setdefault(fiscal,{'records':0,'amount_cents':0});total['records']+=1;total['amount_cents']+=row['amount_cents']
   sha=row['source_sha256'];sources[sha]=sources.get(sha,0)+1
 with partial.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
 report={'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inputs':review,'records':count,'totals':totals,'sourceCounts':sources,'conflictingRevisions':conflict_count,'sha256':sha,'ready':not conflict_count}
 report_path=output.with_suffix('.review.json');report_path.write_text(json.dumps(report,indent=2)+'\n');report_path.chmod(0o600)
 if conflict_count:raise ValueError(f'{conflict_count} conflicting source revisions require review; output remains .partial')
 partial.replace(output);return report
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--inputs',type=pathlib.Path,required=True,help='JSON array of {file,sha256}, published baseline first');p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
 report=merge(json.loads(a.inputs.read_text()),a.output);print(json.dumps({k:v for k,v in report.items() if k not in ['inputs','sourceCounts']}))
