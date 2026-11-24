"""Synthetic local check: recorded obligations must not look like missing funding."""
import os,pathlib
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:19458')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-obligations';out.mkdir(parents=True,exist_ok=True)
nodes=[{'id':'obligation-agency','name':'Example Federal Housing Agency','slug':None,'category':'federal-government','financialAmount':1200000,'receivedUsd':0,'disbursedUsd':0},{'id':'obligation-recipient','name':'Example Housing Recipient','slug':None,'category':'general','financialAmount':1200000,'receivedUsd':0,'disbursedUsd':0}]
meta={'version':'obligation-fixture','generatedAt':'2026-11-24','fy':'all','fiscalYears':[2025]}
totals={'currencies':[],'missingAmounts':0}
rows=[{'id':'award-snapshot','source':nodes[0]['id'],'target':nodes[1]['id'],'sourceLabel':nodes[0]['name'],'targetLabel':nodes[1]['name'],'kind':'transfer','financialFactType':'obligation','financialMeasure':'cumulative_obligations','amount':1000000,'currency':'USD','fiscalYear':2025},{'id':'obligation-change','source':nodes[0]['id'],'target':nodes[1]['id'],'sourceLabel':nodes[0]['name'],'targetLabel':nodes[1]['name'],'kind':'obligation','financialFactType':'obligation','measurement':'delta','amount':200000,'currency':'USD','fiscalYear':2025}]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=b.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100},reduced_motion='reduce')
 ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname=='localhost' and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 ctx.route('**/api/org/api/network/evidence-groups/public?*',lambda r:r.fulfill(json={'group':None}))
 def evidence(r):
  q=parse_qs(urlparse(r.request.url).query);kind=q.get('kind',[''])[0];selected=[x for x in rows if not kind or x['kind']==kind]
  r.fulfill(json={**meta,'organization':{**nodes[0],'recordCount':2},'financialTotals':totals,'parents':[],'children':[],'groups':[{'kind':'transfer','count':1},{'kind':'obligation','count':1}],'records':selected[:int(q.get('limit',['25'])[0])],'total':len(selected),'offset':0,'nextOffset':None})
 ctx.route('**/api/ecosystem/organization-evidence?*',evidence);ctx.route('**/api/ecosystem/organization-group?*',evidence)
 ctx.route('**/api/ecosystem/organization-map?*',lambda r:r.fulfill(json={**meta,'financialTotals':totals,'anchor':nodes[0]['id'],'organizations':nodes,'relationships':[{'id':'edge','source':nodes[0]['id'],'target':nodes[1]['id'],'recordCount':2,'kinds':['transfer','obligation']}],'total':1,'incoming':0,'outgoing':1,'offset':0,'nextOffset':None}))
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/ecosystem/organizations/obligation-agency?fy=all',wait_until='domcontentloaded')
 panel=page.locator('.organization-ecomap');panel.locator('canvas[data-ready="true"]').wait_for(timeout=30000)
 summary=page.get_by_role('region',name='Recorded financial totals',exact=True)
 expect(summary).to_contain_text('No cash payments recorded');expect(summary).to_contain_text('funding commitments')
 expect(page.get_by_text('No recorded transfers',exact=True)).to_have_count(0)
 page.get_by_role('button',name='View Example Federal Housing Agency evidence (2)',exact=True).click()
 records=page.get_by_role('region',name='Evidence for Example Federal Housing Agency',exact=True)
 expect(records).to_contain_text('Cumulative obligations (award total)');expect(records).to_contain_text('Obligation transaction (funding commitment)')
 records.get_by_role('combobox').select_option('transfer')
 expect(records.locator('ol li')).to_have_count(1);expect(records).to_contain_text('Cumulative obligations (award total)')
 for width,theme in [(1400,'dark'),(390,'light')]:
  page.set_viewport_size({'width':width,'height':1100});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
  page.locator('.organization-evidence').screenshot(path=str(out/f'evidence-{width}.png'))
  panel.get_by_role('button',name='Fullscreen',exact=True).click()
  expect(panel.locator('.organization-map-funds')).to_contain_text('No cash payments recorded')
  expect(panel.locator('.organization-map-funds')).to_contain_text('funding commitments')
  panel.screenshot(path=str(out/f'map-{width}.png'))
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  panel.get_by_role('button',name='Exit fullscreen',exact=True).click()
 assert not errors,errors
 b.close()
print('PASS: obligation records remain visible; cash-only empty message and context in summary/fullscreen; cumulative and transaction labels; filter; desktop/mobile; no errors.')
