"""Synthetic public-customer revenue: graph, statement details, cash exclusions."""
import os,pathlib
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:19458');assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-statements';out.mkdir(parents=True,exist_ok=True)
meta={'version':'statement-fixture','generatedAt':'2026-11-24','fiscalYears':[2025,2024]}
nodes=[{'id':'statement-university','name':'Example University','slug':None,'category':'education','financialAmount':100,'receivedUsd':100,'disbursedUsd':0},{'id':'aggregate:public','name':'Public','slug':None,'category':'general','type':'Aggregate customers','financialAmount':None,'receivedUsd':0,'disbursedUsd':0}]
rows=[{'id':'annual-tuition','source':'aggregate:public','target':'statement-university','sourceLabel':'Public','targetLabel':'Example University','kind':'revenue','financialFactType':'revenue','measurement':'period_total','amount':1000000,'currency':'USD','date':'2025-06-30','periodStart':'2024-07-01','periodEnd':'2025-06-30','fiscalYear':2025,'description':'Tuition and fees','notes':'Annual revenue, not an individual payment. Third-party payer shares unspecified.','sourceUrl':'https://projects.propublica.org/nonprofits/organizations/123456789'},{'id':'payment','source':'aggregate:public','target':'statement-university','sourceLabel':'Public','targetLabel':'Example University','kind':'transfer','financialFactType':'disbursement','amount':100,'currency':'USD','date':'2025-06-30','fiscalYear':2025}]
statement={'id':'filing','organizationId':nodes[0]['id'],'name':'Example University','ein':'123456789','periodStart':'2024-07-01','periodEnd':'2025-06-30','accountingBasis':'accrual','revenue':1000000,'expenses':900000,'assets':2000000,'liabilities':500000,'sourceUrl':'https://projects.propublica.org/nonprofits/organizations/123456789','sourceSha256':'1'*64,'statements':{'revenue':{'total':1000000,'reconciled':True,'lines':[{'label':'Tuition and fees','sourceLine':'program1','amount':1000000}]},'expenses':{'total':900000,'reconciled':True,'lines':[{'label':'Salaries and benefits','sourceLine':'salaries','amount':900000}]}}}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=b.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100},reduced_motion='reduce')
 ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname=='localhost' and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 ctx.route('**/api/org/api/network/evidence-groups/public?*',lambda r:r.fulfill(json={'group':None}))
 def evidence(r):
  q=parse_qs(urlparse(r.request.url).query);node=next(n for n in nodes if n['id']==q['org'][0]);selected=rows if q.get('fy')!=['2024'] else []
  r.fulfill(json={**meta,'fy':q.get('fy',['2025'])[0],'organization':{**node,'recordCount':len(selected)},'parents':[],'children':[],'groups':[{'kind':'revenue','count':1},{'kind':'transfer','count':1}],'records':selected,'total':len(selected),'offset':0,'nextOffset':None,'financialTotals':{'currencies':[{'currency':'USD','received':100,'disbursed':0}],'missingAmounts':0}})
 ctx.route('**/api/ecosystem/organization-evidence?*',evidence);ctx.route('**/api/ecosystem/organization-group?*',evidence)
 ctx.route('**/api/ecosystem/nonprofits?*',lambda r:r.fulfill(json={**meta,'records':[statement] if parse_qs(urlparse(r.request.url).query).get('org')==['statement-university'] else [],'total':1,'offset':0,'nextOffset':None}))
 ctx.route('**/api/ecosystem/organization-map?*',lambda r:r.fulfill(json={**meta,'fy':parse_qs(urlparse(r.request.url).query).get('fy',['2025'])[0],'anchor':nodes[0]['id'],'organizations':nodes,'relationships':[{'id':'revenue-link','source':nodes[1]['id'],'target':nodes[0]['id'],'recordCount':2,'kinds':['revenue','transfer']}],'total':1,'incoming':1,'outgoing':0,'offset':0,'nextOffset':None,'financialTotals':{'currencies':[{'currency':'USD','received':100,'disbursed':0}],'missingAmounts':0}}))
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/ecosystem/organizations/statement-university?fy=2025',wait_until='domcontentloaded')
 panel=page.locator('.organization-ecomap');panel.locator('canvas[data-ready="true"]').wait_for(timeout=30000)
 annual=page.get_by_role('region',name='Annual financial statements').last;expect(annual).to_contain_text('$1,000,000')
 annual.locator('summary').click();expect(annual).to_contain_text('Tuition and fees');expect(annual).to_contain_text('Salaries and benefits');expect(annual).to_contain_text('third-party payers')
 expect(page.get_by_role('region',name='Recorded financial totals',exact=True)).to_contain_text('100.00')
 for width,theme,mode in [(1400,'dark','2d'),(390,'light','3d')]:
  page.set_viewport_size({'width':width,'height':1100});page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
  panel.get_by_label('Map mode',exact=True).select_option(mode)
  panel.get_by_role('button',name='Fullscreen',exact=True).click()
  inspector=panel.get_by_role('complementary',name='Node inspector');expect(inspector).to_be_visible()
  expect(inspector.locator('.organization-transaction-bubble').first).to_contain_text('1,000,000.00')
  expect(inspector.locator('.organization-transaction-bubble').first).to_contain_text('Annual revenue')
  expect(inspector.locator('.organization-transaction-bubble').first).to_contain_text('2024-07-01 – 2025-06-30')
  expect(inspector).to_contain_text('Annual revenue · not an individual payment')
  inspector.get_by_role('region',name='Annual financial statements').locator('summary').click()
  expect(inspector).to_contain_text('Salaries and benefits')
  inspector.screenshot(path=str(out/f'inspector-{width}-{mode}.png'))
  inspector.get_by_text('Salaries and benefits',exact=True).scroll_into_view_if_needed()
  inspector.screenshot(path=str(out/f'statement-details-{width}-{mode}.png'))
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  panel.get_by_role('button',name='Exit fullscreen',exact=True).click()
 page.get_by_label('Fiscal year',exact=True).first.select_option('2024')
 expect(page.get_by_role('region',name='Annual financial statements')).to_have_count(0)
 assert not errors,errors;b.close()
print('PASS: annual revenue/expenses, source provenance, separate cash total, largest-first annual bubble, fullscreen 2D/3D desktop/mobile and fiscal-year filtering.')
