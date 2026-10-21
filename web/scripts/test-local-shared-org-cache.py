#!/usr/bin/env python3
"""Verify organization cache reuse across real local pages and browser tabs."""
import json
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from local_browser_test_support import BASE, preflight

preflight()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 context=browser.new_context(ignore_https_errors=True,reduced_motion='reduce')
 organizations=[dict(id='cache-alpha',slug='cache-alpha',name='Cache Shared Alpha',description='Synthetic organization for shared browser cache verification.',tags=['Cache testing'],membership_count=0,upcoming_events_count=0,pending_challenges_count=0,is_disputed=False),dict(id='cache-beta',slug='cache-beta',name='Cache Shared Beta',description='Synthetic peer organization.',tags=['Cache testing'],membership_count=0,upcoming_events_count=0,pending_challenges_count=0,is_disputed=False)]
 counts={'directory':0,'profile':0}
 def route(request):
  url=request.request.url
  parsed=urlparse(url)
  if parsed.hostname not in {'localhost','127.0.0.1'}:request.abort();return
  if parsed.path=='/api/org/api/network/orgs/public' and parsed.query=='limit=500&offset=0':
   counts['directory']+=1
   request.fulfill(json=organizations);return
  if parsed.path=='/api/org/api/network/orgs/public/cache-alpha':
   counts['profile']+=1
   request.fulfill(json=organizations[0]);return
  request.continue_()
 context.route('**/*',route)
 try:
  page=context.new_page()
  page.goto(BASE+'/orgs',wait_until='domcontentloaded')
  expect(page.get_by_role('heading',name='Cache Shared Alpha',exact=True)).to_be_visible(timeout=30000)
  assert counts['directory']==1,counts
  page.get_by_role('heading',name='Cache Shared Alpha',exact=True).get_by_role('link').click()
  expect(page.get_by_role('region',name='Peer Organizations',exact=True)).to_contain_text('Cache Shared Beta',timeout=30000)
  assert counts=={'directory':1,'profile':1},counts
  page.reload(wait_until='domcontentloaded')
  expect(page.get_by_role('region',name='Peer Organizations',exact=True)).to_contain_text('Cache Shared Beta',timeout=30000)
  assert counts=={'directory':1,'profile':1},counts
  other=context.new_page()
  other.goto(BASE+'/orgs',wait_until='domcontentloaded')
  expect(other.get_by_role('heading',name='Cache Shared Alpha',exact=True)).to_be_visible(timeout=30000)
  assert counts=={'directory':1,'profile':1},counts
  databases=page.evaluate('async () => (await indexedDB.databases()).map(db=>db.name)')
  assert databases.count('orgportal-public-organization-data-v1')==1,databases
  print('PASS: directory → organization profile → peer directory → full reload → second tab reuse one public organization IndexedDB, with one directory and one profile request.')
 finally:
  context.close();browser.close()
