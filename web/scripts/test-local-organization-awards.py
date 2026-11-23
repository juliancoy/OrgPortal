"""Synthetic local UI review of awards separated from received/disbursed money."""
import json,pathlib
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
base='https://localhost:8443'
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-awards';out.mkdir(parents=True,exist_ok=True)
anchor='launchport-fixture'
org={'id':anchor,'name':'LaunchPort fixture','recordCount':4,'slug':None}
nodes=[{**org,'category':'company','financialAmount':350000},{'id':'funder-fixture','name':'Public funder fixture','category':'government','financialAmount':350000}]
totals={'currencies':[{'currency':'USD','received':350000,'disbursed':0}],'missingAmounts':0,'awards':[{'currency':'USD','received':975600,'disbursed':0}]}
meta={'fy':'2025','version':'award-fixture','generatedAt':'2026-11-23','fiscalYears':[2025]}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 c=b.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100},locale='en-US',reduced_motion='reduce')
 c.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname=='localhost' and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 c.route('**/api/org/api/network/evidence-groups/public?*',lambda r:r.fulfill(json={'group':None}))
 def profile(r):
  r.fulfill(json={**meta,'organization':org,'parents':[],'children':[],'groups':[],'records':[],'total':4,'offset':0,'nextOffset':None,'financialTotals':totals})
 c.route('**/api/ecosystem/organization-evidence?*',profile);c.route('**/api/ecosystem/organization-group?*',profile)
 c.route('**/api/ecosystem/organization-map?*',lambda r:r.fulfill(json={**meta,'anchor':anchor,'organizations':nodes,'relationships':[{'id':'fixture-link','source':'funder-fixture','target':anchor,'recordCount':4,'kinds':['transfer']}],'total':1,'incoming':1,'outgoing':0,'offset':0,'nextOffset':None,'financialTotals':totals}))
 page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/ecosystem/organizations/'+anchor,wait_until='domcontentloaded')
 panel=page.locator('.organization-ecomap');summary=page.get_by_role('region',name='Recorded financial totals',exact=True)
 panel.locator('canvas[data-ready="true"]').wait_for(timeout=30000)
 for area in [summary,panel.get_by_role('region',name='Map financial totals',exact=True)]:
  expect(area.locator('[data-direction="received"] dd')).to_contain_text('350,000.00')
  expect(area).to_contain_text('975,600.00');expect(area).not_to_contain_text('1,325,600')
 for width,name in [(1400,'desktop'),(390,'mobile')]:
  page.set_viewport_size({'width':width,'height':1100})
  for mode in ['2d','3d']:
   panel.get_by_label('Map mode',exact=True).select_option(mode)
   panel.locator(f'canvas[data-mode="{mode}"][data-ready="true"]').wait_for(timeout=30000)
   for theme in ['light','dark']:
    page.evaluate('(x)=>document.documentElement.dataset.theme=x',theme)
    panel.screenshot(path=str(out/f'{name}-{mode}-{theme}.png'))
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   panel.get_by_role('button',name='Fullscreen',exact=True).click()
   expect(panel.get_by_role('button',name='Exit fullscreen',exact=True)).to_be_visible()
   expect(panel.get_by_role('region',name='Map financial totals',exact=True)).to_contain_text('975,600.00')
   panel.screenshot(path=str(out/f'{name}-{mode}-fullscreen.png'))
   page.keyboard.press('Escape')
   expect(panel.get_by_role('button',name='Fullscreen',exact=True)).to_be_visible()
 summary.screenshot(path=str(out/'mobile-summary.png'))
 assert not errors,errors
 b.close()
print('PASS: separated cash and awards, 2D/3D, desktop/mobile, light/dark, fullscreen and Escape. Captures:',out)
