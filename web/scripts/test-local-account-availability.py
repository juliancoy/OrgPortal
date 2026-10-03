#!/usr/bin/env python3
"""Test account availability against local Docker, including a local worker restart."""
import json,secrets,time,subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
base='https://localhost:8443'
credentials={'email':'availability-history-'+secrets.token_hex(4)+'@example.com','password':secrets.token_urlsafe(30),'full_name':'Availability History Test'}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
 ctx=b.new_context(ignore_https_errors=True,timezone_id='America/New_York')
 ctx.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname=='localhost' else route.abort())
 assert ctx.request.get(base+'/pidp/health').json()['status']=='ok';assert ctx.request.get(base+'/api/org/health').ok
 assert ctx.request.post(base+'/pidp/auth/register',data=credentials).ok
 assert ctx.request.post(base+'/pidp/auth/session/login',form={'username':credentials['email'],'password':credentials['password']},headers={'Origin':base}).ok
 token=ctx.request.get(base+'/pidp/auth/session-token').json()['access_token'];headers={'Authorization':'Bearer '+token}
 def create(slots):
  r=ctx.request.post(base+'/api/org/api/availability',headers=headers,data={'title':'Persistent account calendar acceptance','timezone':'America/New_York','slots':slots});assert r.ok,r.text();return r.json()['id']
 old='2026-09-07T13:00:00.000Z';old_no='2026-09-07T13:30:00.000Z';future='2026-10-26T13:00:00.000Z';future_no='2026-10-26T13:30:00.000Z'
 first=create([old,old_no]);r=ctx.request.put(base+'/api/org/api/availability/'+first+'/me',headers=headers,data={'slots':[old]});assert r.ok,r.text()
 second=create([old,old_no]);assert ctx.request.get(base+'/api/org/api/availability/'+second+'/me',headers=headers).json()['slots']==[old]
 third=create([future,future_no]);page=ctx.new_page();page.goto(base+'/availability/'+third,wait_until='domcontentloaded')
 expect(page.locator('.availability-suggested[aria-pressed=true]')).to_have_count(1)
 expect(page.get_by_text('1 selected slots are historical suggestions.',exact=False)).to_be_visible()
 page.get_by_role('button',name='Save availability',exact=True).click();expect(page.get_by_role('status')).to_have_text('Availability saved to your account.')
 expect(page.locator('.availability-suggested')).to_have_count(0)
 print('PASS: history reused across polls, explicit negative preserved, suggested selection reviewed and saved',flush=True)
 subprocess.run(['docker','restart','session-test-org'],check=True,stdout=subprocess.DEVNULL)
 for _ in range(100):
  try:
   if ctx.request.get(base+'/api/org/health',timeout=1500).ok:break
  except Exception:pass
  time.sleep(.5)
 else:raise AssertionError('local worker failed to restart')
 fresh=b.new_context(ignore_https_errors=True,timezone_id='America/New_York')
 fresh.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname=='localhost' else route.abort())
 assert fresh.request.get(base+'/pidp/health').ok
 assert fresh.request.post(base+'/pidp/auth/session/login',form={'username':credentials['email'],'password':credentials['password']},headers={'Origin':base}).ok
 token=fresh.request.get(base+'/pidp/auth/session-token').json()['access_token'];headers={'Authorization':'Bearer '+token}
 data=fresh.request.get(base+'/api/org/api/availability/'+third+'/me',headers=headers).json();assert data['slots']==[future] and data['suggested_slots']==[],data
 assert fresh.request.put(base+'/api/org/api/availability/'+third+'/me',headers=headers,data={'slots':[]}).ok
 page=fresh.new_page();page.goto(base+'/availability/'+third,wait_until='domcontentloaded');expect(page.locator('tbody td button[aria-pressed=true]')).to_have_count(0)
 print('PASS: fresh login after service restart retains saved account availability and explicit empty response',flush=True)
 b.close()
