#!/usr/bin/env python3
"""Read-only local clickthrough for scoped brand guides, with synthetic public configuration."""
import json
import os
from urllib.parse import urlparse
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:9457').rstrip('/')
assert urlparse(base).hostname in {'localhost','127.0.0.1'}, 'Use an isolated local deployment'
site={'id':'dummy-brand-site','hostname':'dummy-brand.slug.portal.local','name':'Dummy Brand Test','tagline':'Engineering insight.','accent_color':'#0f766e','profile':'community','features':[],'home_org_slug':'dummy-brand','brand_image_path':'/orgportal.svg','home_image_url':'/orgportal.svg','home_url':base+'/portals/dummy-brand','slug':'dummy-brand-portal','home_kind':'landing','home_heading':'Dummy Brand Test','feature_config':{'brandPalette':[{'label':'Research teal','value':'#0f766e'},{'label':'Gold','value':'#d4af37'}]}}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 context=browser.new_context(ignore_https_errors=True,viewport={'width':1280,'height':1000})
 context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(base) and route.request.method in ['GET','HEAD','OPTIONS'] else route.abort())
 context.route('**/api/portal/sites/dummy-brand-portal',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(site)))
 org={'id':'dummy-brand-org','name':'Dummy Brand Test','slug':'dummy-brand','description':'A synthetic organization for local navigation checks.','image_url':'/orgportal.svg','tags':[],'upcoming_events_count':0,'membership_count':0,'pending_challenges_count':0,'is_disputed':False}
 other={**org,'id':'dummy-other-org','name':'Dummy Other Organization','slug':'dummy-other'}
 def public_fixture(route):
  path=urlparse(route.request.url).path
  record=other if '/dummy-other' in path else org
  payload={'portal':None if record is other else site} if path.endswith('/branding') else [] if path.endswith(('/events','/admins')) else record
  route.fulfill(status=200,content_type='application/json',body=json.dumps(payload))
 context.route('**/api/network/orgs/public/dummy-brand**',public_fixture)
 context.route('**/api/network/orgs/public/dummy-other**',public_fixture)
 page=context.new_page();page.goto(base+'/portals/dummy-brand-portal',wait_until='domcontentloaded')
 link=page.get_by_role('region',name='Organization branding').get_by_role('link')
 expect(link).to_have_attribute('href','/orgs/dummy-brand?tab=branding',timeout=30000)
 link.click();expect(page.get_by_role('tab',name='Branding',exact=True)).to_have_attribute('aria-selected','true',timeout=30000)
 expect(page.get_by_role('heading',name='Dummy Brand Test',exact=True)).to_be_visible(timeout=30000)
 expect(page.get_by_role('banner')).to_contain_text('OrgPortal')
 expect(page.get_by_role('banner')).not_to_contain_text('Dummy Brand Test')
 expect(page.get_by_role('heading',name='Approved imagery',exact=True)).to_be_visible()
 expect(page.get_by_role('button',name='Copy Gold color #d4af37',exact=True)).to_be_visible()
 with page.expect_download() as download:
  page.get_by_role('button',name='Download style guide (PNG)',exact=True).click()
 assert Path(download.value.path()).read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
 for width in [1280,390]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=f'/tmp/dummy-brand-guide-{width}.png',full_page=True)
 page.reload();expect(page.get_by_role('heading',name='Dummy Brand Test',exact=True)).to_be_visible(timeout=30000)
 page.get_by_role('tab',name='Info',exact=True).click()
 expect(page.get_by_role('tabpanel',name='Info',exact=True)).to_be_visible()
 expect(page.get_by_role('heading',name='Approved imagery',exact=True)).not_to_be_visible()
 page.get_by_role('tab',name='Info',exact=True).press('ArrowRight')
 expect(page.get_by_role('tab',name='Branding',exact=True)).to_be_focused()
 expect(page.get_by_role('heading',name='Approved imagery',exact=True)).to_be_visible()
 page.go_back();expect(page.get_by_role('tab',name='Info',exact=True)).to_have_attribute('aria-selected','true')
 page.go_forward();expect(page.get_by_role('tab',name='Branding',exact=True)).to_have_attribute('aria-selected','true')
 page.goto(base+'/portals/dummy-brand-portal/branding',wait_until='domcontentloaded')
 expect(page).to_have_url(base+'/orgs/dummy-brand?tab=branding',timeout=30000)
 expect(page.get_by_role('button',name='Copy Gold color #d4af37',exact=True)).to_be_visible()
 page.goto(base+'/orgs/dummy-other?tab=branding',wait_until='domcontentloaded')
 expect(page.get_by_role('heading',name='Dummy Other Organization',exact=True)).to_be_visible(timeout=30000)
 expect(page.get_by_role('button',name='Copy Gold color #d4af37',exact=True)).to_have_count(0)
 expect(page.get_by_role('heading',name='Dummy Brand Test',exact=True)).to_have_count(0)
 expect(page.get_by_role('banner')).to_contain_text('OrgPortal')
 page.get_by_role('contentinfo').get_by_role('link',name='Terms & privacy',exact=True).click()
 expect(page.get_by_role('banner')).to_contain_text('OrgPortal',timeout=30000)
 expect(page.get_by_role('banner')).not_to_contain_text('Dummy Brand Test')
 print('PASS: portal home → org Branding tab → scoped imagery/palette → PNG → reload → Info/Branding keyboard/back/forward → legacy redirect → second-org isolation → desktop/mobile/global identity')
 browser.close()
