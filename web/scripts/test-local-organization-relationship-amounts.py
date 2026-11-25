"""Relationship-relative labels and inspector, with isolated synthetic evidence."""
import os,pathlib
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect

base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:19458')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/relationship-amounts'
out.mkdir(parents=True,exist_ok=True)
meta={'version':'relationship-fixture','generatedAt':'2026-11-25','fy':'2025','fiscalYears':[2025]}
nodes=[{'id':'recipient','name':'Example Recipient','slug':None,'category':'company','financialAmount':100,'receivedUsd':100,'disbursedUsd':0}]
for id,name,amount in [('donor-a','Example Agency A',75),('donor-b','Example Agency B',25)]:
 nodes.append({'id':id,'name':name,'slug':None,'category':'general','financialAmount':1000999999,'receivedUsd':999999,'disbursedUsd':1000000000,'relationshipCash':{'anchorId':'recipient','receivedUsd':None,'disbursedUsd':amount,'missingAmounts':0}})
totals={'currencies':[{'currency':'USD','received':100,'disbursed':0}],'missingAmounts':0}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100},reduced_motion='reduce')
 context.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname=='localhost' and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 context.route('**/api/org/api/network/evidence-groups/public?*',lambda r:r.fulfill(json={'group':None}))
 def evidence(r):
  q=parse_qs(urlparse(r.request.url).query);node=next(n for n in nodes if n['id']==q['org'][0])
  r.fulfill(json={**meta,'organization':{**node,'recordCount':2},'parents':[],'children':[],'groups':[],'records':[],'total':0,'offset':0,'nextOffset':None,'financialTotals':totals})
 context.route('**/api/ecosystem/organization-evidence?*',evidence)
 context.route('**/api/ecosystem/organization-group?*',evidence)
 context.route('**/api/ecosystem/nonprofits?*',lambda r:r.fulfill(json={**meta,'records':[],'total':0,'offset':0,'nextOffset':None}))
 context.route('**/api/ecosystem/organization-map?*',lambda r:r.fulfill(json={**meta,'anchor':'recipient','organizations':nodes,'relationships':[{'id':n['id'],'source':n['id'],'target':'recipient','recordCount':1,'kinds':['transfer']} for n in nodes[1:]],'total':2,'incoming':2,'outgoing':0,'offset':0,'nextOffset':None,'financialTotals':totals}))
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/ecosystem/organizations/recipient?fy=2025',wait_until='domcontentloaded')
 panel=page.locator('.organization-ecomap')
 panel.locator('canvas[data-ready="true"]').wait_for(timeout=30000)
 panel.get_by_label('Node amounts',exact=True).select_option('show')
 for mode in ['2d','3d']:
  panel.get_by_label('Map mode',exact=True).select_option(mode)
  panel.get_by_label('Title placement',exact=True).select_option('floating')
  panel.get_by_role('button',name='Fullscreen',exact=True).click()
  panel.get_by_role('button',name='Fit all connections',exact=True).click()
  donor=panel.locator('button[data-node-id="donor-a"]:visible')
  expect(donor.locator('.organization-ecomap-label-amount')).to_have_text('Cash ↑75')
  if mode=='2d':expect(panel.locator('button[data-node-id="donor-b"]:visible .organization-ecomap-label-amount')).to_have_text('Cash ↑25')
  donor.dispatch_event('pointerenter')
  inspector=panel.get_by_role('complementary',name='Node inspector')
  relation=inspector.get_by_role('region',name='Payments with selected organization')
  expect(relation).to_contain_text('Paid to Example Recipient (USD)')
  expect(relation).to_contain_text('$75.00')
  expect(relation).not_to_contain_text('$1,000,000,000.00')
  expect(inspector).to_contain_text('Organization-wide totals')
  expect(inspector).to_contain_text('$1,000,000,000.00')
  panel.screenshot(path=str(out/f'{mode}-floating.png'))
  panel.get_by_label('Title placement',exact=True).select_option('surface')
  if mode=='2d':expect(donor.locator('.organization-ecomap-label-amount')).to_have_text('Cash ↑75')
  else:page.wait_for_function("Number(document.querySelector('.organization-ecomap canvas').dataset.sphereTitles)>0")
  panel.screenshot(path=str(out/f'{mode}-surface.png'))
  panel.get_by_role('button',name='Exit fullscreen',exact=True).click()
 assert not errors,errors
 browser.close()
print('PASS: 2D/3D relationship labels, circles/spheres, fullscreen inspector and separate organization-wide totals; no browser errors.')
