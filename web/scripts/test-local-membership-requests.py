#!/usr/bin/env python3
"""Request, approve, cancel and leave with isolated local accounts."""
import os,json,secrets,uuid,re,subprocess
from urllib.parse import urlparse,quote
from playwright.sync_api import sync_playwright,expect
from local_browser_test_support import BASE,PIDP_CONTAINER,preflight
preflight();run=uuid.uuid4().hex[:10]
def good(response):
 assert response.ok,f'{response.status}: {response.text()[:300]}'
 return response.json() if 'application/json' in response.headers.get('content-type','') else {}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 def context():
  ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1280,'height':1000})
  ctx.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in {'localhost','127.0.0.1'} else route.abort())
  return ctx
 def account(ctx,label):
  name=f'Dummy Board {label} {run}';email=f'board-{label.lower()}-{run}@example.com';password=secrets.token_urlsafe(32)
  good(ctx.request.post(BASE+'/pidp/auth/register',data={'email':email,'password':password,'full_name':name}))
  # Local synthetic fixture only: the stack disables verification mail delivery.
  # Use the owning PIdP model to verify this exact newly-created dummy account.
  fixture = """import asyncio,sys
from sqlalchemy import select
from db import SessionLocal
from models import User
from main import _verified_identity
async def run():
 async with SessionLocal() as session:
  user=(await session.execute(select(User).where(User.email==sys.argv[1]))).scalar_one()
  assert user.email.startswith('board-') and user.email.endswith('@example.com')
  user.identity_data=_verified_identity(user.identity_data)
  await session.commit()
asyncio.run(run())
"""
  subprocess.run(['docker','exec','-e','PYTHONPATH=/app','-w','/tmp',PIDP_CONTAINER,'/venv/bin/python','-c',fixture,email],check=True,capture_output=True)
  good(ctx.request.post(BASE+'/pidp/auth/session/login',form={'username':email,'password':password},headers={'Origin':BASE}))
  token=good(ctx.request.get(BASE+'/pidp/auth/session-token'))['access_token'];auth={'Authorization':'Bearer '+token}
  good(ctx.request.get(BASE+'/api/org/api/accounts/me',headers=auth))
  good(ctx.request.put(BASE+'/api/org/api/network/contact/me',headers=auth,data={'enabled':False}))
  return name,email,auth
 owner=context();assert good(owner.request.get(BASE+'/api/org/api/network/replication/status'))['mode']=='primary'
 owner_name,owner_email,auth=account(owner,'Owner')
 colleague=context();colleague_name,colleague_email,colleague_auth=account(colleague,'Colleague')
 org=good(owner.request.post(BASE+'/api/org/api/network/orgs',headers=auth,data={'name':f'Dummy Board Organization {run}','city':'Baltimore','kind':'organization','acknowledgeOwnership':True}))
 base=BASE+'/api/org/api/network/orgs/'+org['id'];public=BASE+'/api/org/api/network/orgs/public/'+org['slug']+'/board'
 member=colleague.new_page();member.goto(BASE+'/orgs/'+org['slug']+'?tab=community',wait_until='domcontentloaded')
 member.get_by_role('button',name='Request to join',exact=True).click()
 expect(member.get_by_role('button',name='Request pending',exact=True)).to_be_disabled(timeout=30000)
 state=good(colleague.request.get(base+'/membership',headers=colleague_auth));assert state['status']=='pending' and state['role'] is None
 assert colleague.request.get(base+'/members',headers=colleague_auth).status==403
 member.get_by_role('button',name='Cancel join request',exact=True).click()
 expect(member.get_by_role('button',name='Request to join',exact=True)).to_be_enabled()
 member.get_by_role('button',name='Request to join',exact=True).click()
 expect(member.get_by_role('button',name='Request pending',exact=True)).to_be_disabled()
 manager=owner.new_page();manager.goto(BASE+'/orgs/'+org['slug']+'?tab=personnel',wait_until='domcontentloaded')
 manager.get_by_text('Edit profiles and member access',exact=True).click()
 queue=manager.get_by_role('region',name='Join requests',exact=True)
 expect(queue.get_by_text(colleague_name,exact=False)).to_be_visible(timeout=30000)
 queue.get_by_role('button',name='Review request',exact=True).click()
 manager.get_by_role('button',name='Confirm assignment',exact=True).click()
 expect(queue).to_have_count(0,timeout=30000)
 member.reload(wait_until='domcontentloaded')
 expect(member.get_by_role('button',name='Leave group',exact=True)).to_be_visible(timeout=30000)
 member.get_by_role('tab',name='About',exact=True).click()
 member.get_by_role('button',name='Leave group',exact=True).click()
 expect(member.get_by_role('button',name='Leave group',exact=True)).to_have_count(0)
 assert good(colleague.request.get(base+'/membership',headers=colleague_auth))['status']=='none'
 member.reload(wait_until='domcontentloaded')
 expect(member.get_by_role('button',name='Leave group',exact=True)).to_have_count(0)
 print('PASS: request, denial before approval, cancellation, manager review/approval, and leave from About')
 browser.close()
