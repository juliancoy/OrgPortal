#!/usr/bin/env python3
"""Star voting and optimistic count checks against synthetic accounts on isolated local Docker."""
import base64,json,secrets,re,subprocess,uuid
from pathlib import Path
from urllib.parse import urlencode,urlparse
from playwright.sync_api import sync_playwright,expect
from local_browser_test_support import BASE,preflight,PIDP_CONTAINER
preflight()
assert PIDP_CONTAINER.startswith(('common-form-test-','android-team-form-','team-form-test-'))
run=uuid.uuid4().hex[:10]
submission_id=str(uuid.uuid4())
out=Path('/tmp/orgportal-star-votes');out.mkdir(exist_ok=True)
seed='''
import asyncio,sys,json,hashlib
sys.path.insert(0,"/app")
from datetime import datetime,timedelta
from urllib.parse import urlparse
from sqlalchemy import select
from db import SessionLocal,engine
from config import settings
from models import User
args=json.load(sys.stdin)
assert urlparse(settings.database_url).hostname in ['common-form-test-identity-db','android-team-form-identity-db','team-form-test-identity-db']
async def main():
 async with SessionLocal() as session:
  user=(await session.execute(select(User).where(User.email==args['email']))).scalar_one()
  identity=dict(user.identity_data or {})
  identity['email_verification']={'token_hash':hashlib.sha256(args['token'].encode()).hexdigest(),'expires_at':(datetime.utcnow()+timedelta(minutes=10)).isoformat(),'next':'/profile'}
  user.identity_data=identity
  await session.commit()
 await engine.dispose()
asyncio.run(main())
'''
def ok(r):
 assert r.ok,f'Local fixture request failed: {r.status}'
 return r.json() if 'application/json' in r.headers.get('content-type','') else {}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 contexts=[]
 def account(role):
  c=browser.new_context(ignore_https_errors=True);contexts.append(c)
  c.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in ['localhost','127.0.0.1'] else route.abort())
  email=f'team-form-{role}-{run}@example.com';password=secrets.token_urlsafe(32)
  ok(c.request.post(BASE+'/pidp/auth/register',data={'email':email,'password':password,'full_name':'Dummy '+role+' '+run}))
  token=secrets.token_urlsafe(32)
  result=subprocess.run(['docker','exec','-i','-w','/tmp',PIDP_CONTAINER,'/venv/bin/python','-c',seed],input=json.dumps({'email':email,'token':token}),capture_output=True,text=True)
  assert result.returncode==0,'Could not prepare local synthetic verification challenge'
  assert c.request.get(BASE+'/pidp/auth/verify-email?'+urlencode({'email':email,'token':token}),max_redirects=0).status==303
  ok(c.request.post(BASE+'/pidp/auth/session/login',form={'username':email,'password':password},headers={'Origin':BASE}))
  token=ok(c.request.get(BASE+'/pidp/auth/session-token'))['access_token']
  return c,{'Authorization':'Bearer '+token}
 host,auth=account('host')
 assert ok(host.request.get(BASE+'/api/org/api/network/replication/status'))['mode']=='primary'
 group=ok(host.request.post(BASE+'/api/org/api/network/orgs',headers=auth,data={'name':'Dummy voting host '+run,'city':'Baltimore','kind':'organization','acknowledgeOwnership':True}))
 event=ok(host.request.post(BASE+'/api/org/api/network/events',headers=auth,data={'title':'Dummy voting demo '+run,'host_type':'org','host_org_id':group['id'],'ingest_key':'voting-'+run,'starts_at':'2099-11-17T23:00:00Z','description':'A synthetic voting test.'}))
 endpoint=BASE+'/api/org/api/network/events/'+event['id']+'/presentations'
 ok(host.request.put(endpoint+'/form',headers=auth,data={'enabled':True}))

 team=ok(host.request.post(BASE+'/api/org/api/network/orgs',headers=auth,data={'name':'Dummy star team '+run,'kind':'team','acknowledgeOwnership':True}))
 ok(host.request.put(endpoint+'/'+submission_id,headers=auth,data={'organization_id':team['id'],'title':'A clearer vote control','summary':'Synthetic voting layout and optimistic count check.'}))
 page=host.new_page();page.goto(BASE+'/events/'+event['slug'])
 card=page.locator('.presentation-submission').filter(has_text='A clearer vote control')
 button=card.locator('.submission-card-select');count=button.locator('.submission-card-state')
 expect(button).to_be_enabled(timeout=30000);expect(count).to_have_text('0')
 pending=[]
 page.route('**/presentations/favorites/'+submission_id,lambda route:pending.append(route))
 button.click();expect(button).to_have_attribute('aria-pressed','true');expect(count).to_have_text('1')
 assert len(pending)==1,'Vote must be pending while optimistic state is visible'
 pending.pop().continue_();expect(button).to_be_enabled()
 button.click();expect(button).to_have_attribute('aria-pressed','false');expect(count).to_have_text('0')
 pending.pop().continue_();expect(button).to_be_enabled()
 button.click();expect(count).to_have_text('1');pending.pop().fulfill(status=503,json={'message':'Synthetic save failure'})
 expect(button).to_have_attribute('aria-pressed','false');expect(count).to_have_text('0')
 expect(page.get_by_role('alert').filter(has_text='Synthetic save failure')).to_be_visible()
 page.reload();expect(button).to_be_enabled(timeout=30000);expect(count).to_have_text('0')
 page.unroute('**/presentations/favorites/'+submission_id)
 print('PASS: optimistic add/remove before network completion, save failure rollback and reload persistence',flush=True)
 for mode in ['light','dark']:
  page.evaluate('(mode)=>document.documentElement.setAttribute("data-theme",mode)',mode)
  for selected in [False,True]:
   if selected:button.click();expect(button).to_be_enabled();expect(count).to_have_text('1')
   for width in [1280,390]:
    page.set_viewport_size({'width':width,'height':900});card.screenshot(path=str(out/f'{mode}-{width}-{selected}.png'))
   color=button.locator('svg').evaluate('(node)=>getComputedStyle(node).color')
   assert color==('rgb(229, 191, 85)' if mode=='dark' else 'rgb(166, 124, 0)') if selected else color not in ['rgb(229, 191, 85)','rgb(166, 124, 0)']
   if selected:button.click();expect(button).to_be_enabled();expect(count).to_have_text('0')
 print('PASS: selected gold, unselected neutral; desktop/mobile light/dark captures',flush=True)
 browser.close()
