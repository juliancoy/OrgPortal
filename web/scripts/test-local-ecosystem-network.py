from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
import os
base=os.environ.get("ORGPORTAL_LOCAL_BASE", "https://localhost:8443").rstrip("/")
assert urlparse(base).hostname in {"localhost", "127.0.0.1"}, "Local browser test only"
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
 c=b.new_context(ignore_https_errors=True,viewport={'width':1440,'height':1000})
 c.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ['localhost','127.0.0.1'] else r.abort())
 page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/ecosystem/network')
 expect(page.locator('#network-status')).to_contain_text('organizations',timeout=60000)
 expect(page.locator('#network-table table')).to_be_visible()
 page.locator('#network-search').fill('Code Collective');page.locator('#network-results button').first.click()
 expect(page.locator('#network-detail')).to_contain_text('Code Collective')
 page.locator('#event-search').fill('Baltimore');expect(page.locator('#event-results li').first).to_be_visible()
 page.screenshot(path='/tmp/orgportal-ecosystem-desktop.png',full_page=False)
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path='/tmp/orgportal-ecosystem-mobile.png',full_page=False)
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),'Horizontal overflow'
 page.evaluate("path => { history.pushState(history.state,'',path);dispatchEvent(new PopStateEvent('popstate')); }",urlparse(base).path+'/orgs');expect(page.locator('#network-canvas')).to_have_count(0)
 page.goto(base+'/ecosystem/network?org=org-city-garage')
 expect(page.locator('#network-status')).to_contain_text('organizations',timeout=60000)
 assert not errors,errors
 print('PASS shared portal graph, sourced table, organization selection, event search, mobile layout, and remount; no browser exceptions.')
 b.close()
