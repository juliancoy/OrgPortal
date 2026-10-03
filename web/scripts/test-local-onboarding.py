#!/usr/bin/env python3
"""Verify onboarding using only the existing local Docker portal and PIdP."""
import secrets
import uuid
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
base='https://localhost:8443'
root=Path('/home/julian/Documents/OrgPortal/.local/session-test')
root.mkdir(parents=True,exist_ok=True)
account={'email':f'onboarding-{uuid.uuid4().hex}@example.com','password':secrets.token_urlsafe(32)}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 context=browser.new_context(ignore_https_errors=True,viewport={'width':1280,'height':900})
 context.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in {'localhost','127.0.0.1'} else route.abort())
 assert context.request.post(base+'/pidp/auth/register',data={**account,'full_name':'Local Onboarding Test'}).ok
 assert context.request.post(base+'/pidp/auth/session/login',form={'username':account['email'],'password':account['password']},headers={'Origin':base}).ok
 page=context.new_page()
 page.goto(base+'/people')
 expect(page.get_by_role('link',name='Continue onboarding')).to_be_visible(timeout=30000)
 page.get_by_role('link',name='Continue onboarding').click()
 expect(page.get_by_role('heading',name='LifeTech onboarding',exact=True)).to_be_visible(timeout=30000)
 expect(page.get_by_role('button',name='Save month availability')).to_be_disabled()
 print('PASS: local authenticated onboarding, month calendar, required review',flush=True)
 page.screenshot(path=str(root/'onboarding-desktop.png'),full_page=True)
 for _ in range(4):
  button=page.get_by_role('button',name='I have completed this step').first
  if button.count():
   button.click()
   expect(page.get_by_text('Progress saved.',exact=True)).to_be_visible()
   page.wait_for_timeout(200)
 page.get_by_role('button',name='Next week').click()
 expect(page.get_by_text('Week 2 of 5',exact=True)).to_be_visible()
 page.get_by_role('checkbox',name='I reviewed the whole month').check()
 page.get_by_role('button',name='Save month availability').click()
 expect(page.get_by_text('Onboarding complete',exact=True)).to_be_visible(timeout=10000)
 page.reload()
 expect(page.get_by_text('Onboarding complete',exact=True)).to_be_visible(timeout=10000)
 print('PASS: all steps, month save, and persisted completion after reload',flush=True)
 page.set_viewport_size({'width':390,'height':844})
 page.screenshot(path=str(root/'onboarding-mobile.png'),full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Page overflows at mobile width'
 print('PASS: mobile layout without page overflow',flush=True)
 browser.close()
