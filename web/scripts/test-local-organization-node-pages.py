"""Read-only source-node deep links, evidence and direct label navigation."""
import os,pathlib
from urllib.parse import urlparse,quote
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-node-pages';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1200,'height':1000})
 ctx.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in ['localhost','127.0.0.1','::1'] and route.request.method in ['GET','HEAD','OPTIONS'] else route.abort())
 data=ctx.request.get(base+'/api/ecosystem/organization-map?org=state-of-maryland&limit=250').json()
 node=next(n for n in data['organizations'] if n['name']=='Comptroller of Maryland')
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 url=base+'/ecosystem/organizations/'+quote(node['id'],safe='')
 page.goto(url,wait_until='domcontentloaded')
 section=page.get_by_role('region',name='EcoMap for Comptroller of Maryland',exact=True)
 expect(section.locator('canvas')).to_have_attribute('data-ready','true',timeout=60000)
 page.get_by_role('button',name=__import__('re').compile('^View Comptroller of Maryland evidence')).click()
 expect(page.get_by_role('region',name='Evidence for Comptroller of Maryland',exact=True)).to_be_visible(timeout=30000)
 page.get_by_role('button',name='Hide records',exact=True).first.click()
 for width in [1200,390]:
  page.set_viewport_size({'width':width,'height':1000});page.wait_for_timeout(200)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.locator('.organization-profile').screenshot(path=str(out/f'comptroller-{width}.png'))
 # A visible adjacent label navigates directly; no intermediate selection panel.
 label=section.locator('.organization-ecomap-labels button:not(.focus)').first
 name=label.get_attribute('title');label.click()
 expect(page.get_by_role('heading',name=name,exact=True).first).to_be_visible(timeout=60000)
 expect(page.get_by_role('region',name='EcoMap for '+name,exact=True).locator('canvas')).to_have_attribute('data-ready','true',timeout=60000)
 assert page.url!=url
 # A source URL with a reviewed directory identity resolves to that directory page.
 page.goto(base+'/ecosystem/organizations/org-tedco',wait_until='domcontentloaded')
 page.wait_for_url('**/orgs/tedco',timeout=60000)
 page.goto(base+'/ecosystem/organizations/missing-node-for-read-only-check',wait_until='domcontentloaded')
 expect(page.get_by_role('heading',name='Organization unavailable',exact=True)).to_be_visible(timeout=30000)
 assert not errors,errors
 browser.close()
print('PASS: source-node deep link, Comptroller evidence, desktop/mobile layout, adjacent label navigation, canonical directory redirect, unknown-node empty state')
print(out)
