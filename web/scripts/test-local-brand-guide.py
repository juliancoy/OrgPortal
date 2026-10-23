#!/usr/bin/env python3
"""Read-only local clickthrough for scoped brand guides, with synthetic public configuration."""
import json
import os
from urllib.parse import urlparse
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:9457').rstrip('/')
assert urlparse(base).hostname in {'localhost','127.0.0.1'}, 'Use an isolated local deployment'
site={'id':'dummy-brand-site','hostname':'dummy-brand.slug.portal.local','name':'Dummy Brand Test','tagline':'Engineering insight.','accent_color':'#0f766e','profile':'community','features':[],'home_org_slug':'dummy-brand','brand_image_path':'/orgportal.svg','home_image_url':'/orgportal.svg','home_url':base+'/portals/dummy-brand','slug':'dummy-brand','home_kind':'landing','home_heading':'Dummy Brand Test','feature_config':{'brandPalette':[{'label':'Research teal','value':'#0f766e'},{'label':'Gold','value':'#d4af37'}]}}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 context=browser.new_context(ignore_https_errors=True,viewport={'width':1280,'height':1000})
 context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(base) and route.request.method in ['GET','HEAD','OPTIONS'] else route.abort())
 context.route('**/api/portal/sites/dummy-brand',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(site)))
 page=context.new_page();page.goto(base+'/portals/dummy-brand',wait_until='domcontentloaded')
 link=page.get_by_role('region',name='Organization branding').get_by_role('link')
 expect(link).to_have_attribute('href','/portals/dummy-brand/branding',timeout=30000)
 link.click();expect(page.get_by_role('heading',name='Dummy Brand Test',exact=True)).to_be_visible(timeout=30000)
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
 page.get_by_role('contentinfo').get_by_role('link',name='Terms & privacy',exact=True).click()
 expect(page.get_by_role('banner')).to_contain_text('OrgPortal',timeout=30000)
 expect(page.get_by_role('banner')).not_to_contain_text('Dummy Brand Test')
 print('PASS: shared portal home → scoped brand guide → correct imagery and palette → PNG download → reload → desktop/mobile fit → global OrgPortal branding restored')
 browser.close()
