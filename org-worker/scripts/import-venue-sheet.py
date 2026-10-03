#!/usr/bin/env python3
"""Build an idempotent venue/event import from the supplied Event Spaces sheet snapshot.

Output contains private organizer contacts. Keep source and SQL files out of Git.
This is an operator import, not a membership or permission mutation.
"""
import argparse, hashlib, json, re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--organization',required=True);args=p.parse_args()
data=json.loads(args.source.read_text());source=f"https://docs.google.com/spreadsheets/d/{data['spreadsheet_id']}/edit?gid={data['sheet_id']}#gid={data['sheet_id']}"
def quote(value):return 'NULL' if value is None else "'"+str(value).replace("'","''")+"'"
venues={};category='indoor'
for number,row in enumerate(data['rows'],1):
 row=list(row)+[None]*15
 if row[0]=='Outdoor Venues':category='outdoor';continue
 if row[0]=='Table Rentals':break
 name=str(row[1] or '').strip()
 if not name or name in ['Name','Venue Name']:continue
 key=re.sub(r'\s+',' ',name.lower());id='venue-'+hashlib.sha256((data['spreadsheet_id']+'|'+key).encode()).hexdigest()[:20]
 record=venues.setdefault(key,{'id':id,'name':name,'category':category,'status':'inactive' if 'defunct' in name.lower() else 'active','rows':[]})
 record['rows'].append(number)
 def keep(field,value):
  if value and not record.get(field):record[field]=str(value).strip()
 keep('address',row[3] if row[3] and not str(row[3]).startswith('http') else None)
 keep('capacity',row[8]);keep('cost',row[9]);keep('opening_hours',row[10]);keep('amenities',row[12]);keep('notes',row[13]);keep('host_status',row[14])
 keep('contact_name',row[4] if row[4] and not str(row[4]).startswith('http') else None)
 keep('contact_email',', '.join(re.findall(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}',str(row[5] or ''))))
 keep('contact_phone',row[6] if row[6] and not str(row[6]).startswith('http') else None)
 for cell in [row[11],row[4],row[6]]:
  if cell and str(cell).startswith(('http://','https://')):keep('website',cell)
 if row[11] and not record.get('website'):keep('website','https://'+str(row[11]))
 if row[14]:keep('notes',(record.get('notes','')+'\nSheet host status: '+str(row[14])).strip())
for supplement in data.get('supplemental_venues',[]):
 key=re.sub(r'\s+',' ',supplement['name'].strip().lower())
 existing=venues.get(key)
 if existing:
  existing.update({k:v for k,v in supplement.items() if k!='source_url'})
 else:
  venues[key]={**supplement,'id':'venue-'+hashlib.sha256((data['spreadsheet_id']+'|'+key).encode()).hexdigest()[:20],'status':'active','rows':[]}
candidate_keys=[re.sub(r'\s+',' ',name.strip().lower()) for name in data.get('candidate_names',[])]
if any(key not in venues for key in candidate_keys):raise ValueError('A candidate venue is missing from the import')
columns=['id','name','address','website','amenities','capacity','cost','opening_hours','category','status','contact_name','contact_email','contact_phone','notes']
statements=[]
for v in venues.values():
 statements.append('INSERT INTO venues ('+','.join(columns)+',organization_id,source_url,source_rows_json) VALUES ('+','.join(quote(v.get(c)) for c in columns)+','+quote(args.organization)+','+quote(v.get('source_url') or source)+','+quote(json.dumps(v['rows']))+') ON CONFLICT(id) DO NOTHING;')
for date in ['2026-10-20','2026-11-17']:
 id='medtech-in-the-hut-'+date
 description='A follow-up to Medtech in the Hut for the Baltimore MedTech community. Event time and venue are not yet confirmed.'
 if date=='2026-10-20':description+=' Rank the candidate venues on this page to help the community choose a location.'
 statements.append('INSERT INTO events (id,ingest_key,title,slug,description,event_date,timezone,host_org_id,host_org_name,tags,city) VALUES ('+','.join(quote(v) for v in [id,'portal:'+id,'Medtech in the Hut',id,description,date,'America/New_York',args.organization,'Baltimore MedTech',json.dumps(['MedTech','Healthcare','Tech Community']),'Baltimore'])+') ON CONFLICT(id) DO NOTHING;')
 if date=='2026-10-20':
  for key in candidate_keys:
   statements.append('INSERT INTO event_venues (event_id,venue_id,status) VALUES ('+quote(id)+','+quote(venues[key]['id'])+",'candidate') ON CONFLICT(event_id,venue_id) DO NOTHING;")
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text('\n'.join(statements)+'\n');args.output.chmod(0o600)
print(json.dumps({'venues':len(venues),'inactive_venues':sum(v['status']=='inactive' for v in venues.values()),'events':['2026-10-20','2026-11-17'],'october_candidates':data.get('candidate_names',[]),'time_status':'unconfirmed','sha256':hashlib.sha256(args.output.read_bytes()).hexdigest()},indent=2))
