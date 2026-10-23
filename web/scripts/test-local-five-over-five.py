#!/usr/bin/env python3
"""Actual nomination/voting clickthrough; dummy org/accounts, isolated Docker only."""
import json, os, secrets, uuid
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from local_browser_test_support import BASE, preflight, verification_link
preflight()
run=uuid.uuid4().hex[:10]
def good(response):
 assert response.ok, f'{response.status}: {response.text()[:300]}'
 return response.json() if "application/json" in response.headers.get("content-type", "") else {}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1280,'height':1000})
 ctx.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in {'localhost','127.0.0.1'} else route.abort())
 assert good(ctx.request.get(BASE+'/api/org/api/network/replication/status'))['mode']=='primary'
 email=f'five-{run}@example.com';password=secrets.token_urlsafe(32)
 good(ctx.request.post(BASE+'/pidp/auth/register',data={'email':email,'password':password,'full_name':'Dummy Five Tester'}))
 assert ctx.request.get(verification_link(email),max_redirects=0).status==303
 good(ctx.request.post(BASE+'/pidp/auth/session/login',form={'username':email,'password':password},headers={'Origin':BASE}))
 token=good(ctx.request.get(BASE+'/pidp/auth/session-token'))['access_token'];auth={'Authorization':'Bearer '+token}
 org=good(ctx.request.post(BASE+'/api/org/api/network/orgs',headers=auth,data={'name':f'Dummy Five Over Five {run}','city':'Baltimore','kind':'organization','description':'Isolated local recognition fixture.','acknowledgeOwnership':True}))
 endpoint=BASE+'/api/org/api/network/orgs/'+org['slug']+'/five-over-five'
 for i in range(4):
  good(ctx.request.post(endpoint+'/nominees',headers=auth,data={'name':f'Dummy Nominee {i}','accomplishment':'Built a useful local demo.','connection':'A synthetic community collaborator.','eligible':True,'consent':True}))
 page=ctx.new_page();page.goto(BASE+'/orgs/'+org['slug']+'/five-over-five',wait_until='domcontentloaded')
 expect(page.get_by_role('heading',name='Five over Five.')).to_be_visible(timeout=30000)
 form=page.locator('#nominate form');expect(form).to_be_visible(timeout=30000)
 form.get_by_label('Nominee’s name').fill('Dummy Fifth Nominee')
 form.get_by_label('What have they accomplished?').fill('Designed a working prototype for the local test.')
 form.get_by_label('How are they in our orbit?').fill('Worked alongside the synthetic demo team.')
 form.get_by_label('They are older than five years.').check()
 form.get_by_label('I have permission').check()
 form.get_by_role('button',name='Publish nomination').click()
 expect(page.get_by_role('heading',name='Dummy Fifth Nominee',exact=True)).to_be_visible(timeout=30000)
 expect(page.get_by_text('2 choices among 5',exact=False)).to_be_visible()
 page.get_by_role('button',name='Vote for Dummy Nominee 0',exact=True).click()
 expect(page.get_by_role('button',name='Vote for Dummy Nominee 0',exact=True)).to_have_attribute('aria-pressed','true')
 page.get_by_role('button',name='Vote for Dummy Fifth Nominee',exact=True).click()
 expect(page.get_by_role('button',name='Vote for Dummy Fifth Nominee',exact=True)).to_have_attribute('aria-pressed','true')
 expect(page.get_by_role('button',name='Vote for Dummy Nominee 1',exact=True)).to_be_disabled()
 page.reload(wait_until='domcontentloaded')
 expect(page.get_by_role('button',name='Vote for Dummy Fifth Nominee',exact=True)).to_have_attribute('aria-pressed','true',timeout=30000)
 page.get_by_role('button',name='Vote for Dummy Nominee 0',exact=True).click()
 expect(page.get_by_role('button',name='Vote for Dummy Nominee 1',exact=True)).to_be_enabled()
 page.get_by_role('button',name='Vote for Dummy Nominee 1',exact=True).click()
 expect(page.get_by_role('button',name='Vote for Dummy Nominee 1',exact=True)).to_have_attribute('aria-pressed','true')
 page.on('dialog',lambda dialog:dialog.accept())
 page.locator('.five-nominee').filter(has=page.get_by_role('heading',name='Dummy Nominee 3',exact=True)).get_by_role('button',name='Remove nomination').click()
 expect(page.get_by_role('heading',name='Dummy Nominee 3',exact=True)).to_have_count(0)
 expect(page.get_by_text('1 choice among 4',exact=False)).to_be_visible()
 expect(page.get_by_text('1 of 1 choices saved.',exact=False)).to_be_visible()
 for width in [1280,390]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), f'Overflow at {width}'
  page.screenshot(path=f'/tmp/dummy-five-over-five-{width}.png',full_page=True)
 # The public endpoint exposes neither authors nor private ballot identity.
 public=good(ctx.request.get(endpoint));assert all('submitted_by' not in row for row in public['nominees'])
 guest=browser.new_context(ignore_https_errors=True)
 guest.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in {'localhost','127.0.0.1'} else route.abort())
 assert guest.request.put(endpoint+'/ballot',data={'selections':[]}).status==401
 guestpage=guest.new_page();guestpage.goto(BASE+'/orgs/'+org['slug']+'/five-over-five',wait_until='domcontentloaded')
 expect(guestpage.get_by_role('heading',name='Dummy Fifth Nominee',exact=True)).to_be_visible(timeout=30000)
 expect(guestpage.get_by_role('button',name='Vote for Dummy Fifth Nominee',exact=True)).to_be_disabled()
 expect(guestpage.get_by_role('link',name='Sign in to nominate',exact=True)).to_have_attribute('href',f'/users/login?next=%2Forgs%2F{org["slug"]}%2Ffive-over-five%23nominate')
 # Exercise the website's actual shared header locally, with remote requests blocked.
 script=Path(__file__).resolve().parents[3]/'CodeCollective/js/reusableComponents.js'
 page.route(BASE+'/__five-site-test',lambda route:route.fulfill(content_type='text/html',body='<our-header></our-header><script src="/__five-site-header.js"></script>'))
 page.route(BASE+'/__five-site-header.js',lambda route:route.fulfill(content_type='text/javascript',body=script.read_text()))
 page.goto(BASE+'/__five-site-test',wait_until='domcontentloaded')
 expect(page.locator('#portal-login-button')).to_have_attribute('href','https://orgportal.cc/users/login?next=%2Forgs%2Fcode-collective')
 browser.close()
 print('PASS: real local nomination → 25%-rounded-up voting → cap → reload → change votes → withdrawal/cap reduction → private ballots → guest denial → desktop/mobile → website login destination')
