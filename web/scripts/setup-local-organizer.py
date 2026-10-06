"""Reuse the isolated local session-test account for organizer browser preview."""
import json,time,requests,urllib3
from pathlib import Path
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
base='https://localhost:8443';account=json.loads((Path(__file__).resolve().parents[2] / '.local/session-test/account.json').read_text());session=requests.Session();session.verify=False
for attempt in range(45):
 try:
  if session.get(base+'/pidp/health',timeout=2).ok:break
 except requests.RequestException:pass
 time.sleep(1)
else:raise RuntimeError('Local PIdP did not start')
def call(method,path,**kwargs):
 r=session.request(method,base+path,timeout=15,**kwargs)
 if not r.ok:raise RuntimeError(f'{method} {path}: HTTP {r.status_code}, {r.text[:160]}')
 return r.json() if r.content else None
owner=call('POST','/pidp/auth/token',data={'username':account['email'],'password':account['password']})['access_token'];headers={'Authorization':'Bearer '+owner}
sites=call('GET','/pidp/websites',headers=headers);site=next((x for x in sites if x['slug']=='code-collective'),None)
if not site:site=call('POST','/pidp/websites',headers=headers,json={'name':'Local OrgPortal','slug':'code-collective','allowed_redirect_origins':[base]})
r=session.post(base+'/pidp/websites/code-collective/auth/register',json={**account,'full_name':'Local Session Test'},timeout=15)
assert r.status_code in [200,201,409],f'Member fixture registration: {r.status_code}'
member=call('POST','/pidp/websites/code-collective/auth/token',json=account)['access_token']
plan=call('POST','/pidp/auth/account-links/preview',headers=headers,json={'member_token':member})
call('POST','/pidp/auth/account-links/apply',headers=headers,json={'member_token':member,'previewId':plan['previewId'],'confirm':True})
orgs=call('GET','/api/org/api/network/orgs?mine=true&limit=300',headers=headers)
org=next((x for x in orgs if x.get('my_role') in ['owner','administrator']),None)
if not org:org=call('POST','/api/org/api/network/orgs',headers=headers,json={'name':'Local Organizer Preview','description':'Persistent local fixture for organization UI development.'})
print('Local member sign-in is registered and linked to the existing test identity.')
print('Organizer page:',base+'/orgs/'+org['slug']+'?view=organizers')
