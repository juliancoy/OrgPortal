"""Read-only local fiscal-year UI, evidence totals, pagination and map navigation."""
import json,os,pathlib
from urllib.parse import urlparse,urlencode,quote,parse_qs
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
node='source-label:maryland_comptroller:recipient:f8cd3dbed84f5a8ad768ba20d323fd32'
url=base+'/ecosystem/organizations/'+quote(node,safe='')
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-year';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,locale='en-US',viewport={'width':1400,'height':1100},reduced_motion='reduce')
 ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ['localhost','127.0.0.1','::1'] and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 expected={}
 for fy in ['2025','2024','all','unassigned','2027']:
  response=ctx.request.get(base+'/api/ecosystem/organization-evidence?'+urlencode({'org':node,'fy':fy,'limit':100}))
  assert response.ok,response.text()
  expected[fy]=response.json()
  if fy in ['2025','2024']:assert all(str(r['fiscalYear'])==fy for r in expected[fy]['records'])
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def ready():
  page.locator('.organization-ecomap canvas[data-ready="true"]').wait_for(timeout=60000)
  page.wait_for_function('()=>{const c=document.querySelector(".organization-ecomap canvas");return c?.dataset.ready==="true"&&!c.dataset.transitioning}')
 def check(fy):
  expect(page.get_by_label('Fiscal year',exact=True)).to_have_value(fy)
  totals=page.get_by_role('region',name='Recorded financial totals',exact=True)
  expect(totals).to_be_visible(timeout=60000)
  amounts=expected[fy]['financialTotals']['currencies']
  if amounts:
   expect(totals.locator('dd').first).to_have_text('USD\xa0'+format(amounts[0]['received'],',.2f'))
  else:expect(totals.locator('dd').first).to_have_text('No recorded transfers')
  expect(totals).to_contain_text('across all dates' if fy=='all' else 'no assigned fiscal year' if fy=='unassigned' else 'for FY'+fy)
  ready()
  return expected[fy]['total']
 page.goto(url,wait_until='domcontentloaded')
 count=check('2025');assert count==45
 page.get_by_role('button',name=f'View CVS PHARMACY INC evidence ({count})',exact=True).click()
 evidence=page.get_by_role('region',name='Evidence for CVS PHARMACY INC',exact=True)
 expect(evidence).to_be_visible(timeout=30000)
 evidence.get_by_role('button',name='Next records',exact=True).click()
 expect(evidence.locator('ol')).to_have_attribute('start','26')
 page.get_by_label('Color by',exact=True).select_option('volume')
 page.get_by_label('Navigation speed',exact=True).select_option('3')
 page.evaluate('window.yearCanvas=document.querySelector(".organization-ecomap canvas")')
 for fy in ['2024','all','unassigned','2027','2025']:
  page.get_by_label('Fiscal year',exact=True).select_option(fy)
  count=check(fy)
  print('Year settings',fy,page.get_by_label('Color by',exact=True).input_value(),page.evaluate('({same:yearCanvas===document.querySelector(".organization-ecomap canvas"),navigation:performance.getEntriesByType("navigation").map(n=>n.type)})'),flush=True)
  expect(page.get_by_label('Color by',exact=True)).to_have_value('volume')
  expect(page.get_by_label('Navigation speed',exact=True)).to_have_value('3')
  assert page.evaluate('yearCanvas===document.querySelector(".organization-ecomap canvas")'),'Year change replaced the 2D canvas'
  expect(evidence.locator('ol')).to_have_attribute('start','1',timeout=30000)
  expect(evidence.locator('ol > li')).to_have_count(min(25,count))
  assert parse_qs(urlparse(page.url).query)['fy']==[fy]
 page.reload(wait_until='domcontentloaded');check('2025')
 for theme,width in [('light',1400),('dark',390)]:
  page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
  page.set_viewport_size({'width':width,'height':1100})
  page.locator('.organization-ecomap').screenshot(path=str(out/f'map-{theme}-{width}.png'))
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.set_viewport_size({'width':1400,'height':1100})
 # Full-map links and selected-node parent navigation keep the selected period.
 page.get_by_label('Fiscal year',exact=True).select_option('2024');check('2024')
 expect(page.get_by_role('link',name='Open full EcoMap')).to_have_attribute('href',__import__('re').compile('fy=2024'))
 page.get_by_label('Map mode',exact=True).select_option('3d');ready()
 page.locator('.organization-ecomap-labels').get_by_role('button',name='CVS PHARMACY INC',exact=True).click()
 page.wait_for_url(__import__('re').compile('.*agency.*fy=2024'));ready()
 expect(page.get_by_label('Fiscal year',exact=True)).to_have_value('2024')
 expect(page.get_by_label('Map mode',exact=True)).to_have_value('3d')
 page.go_back();check('2024')
 assert not errors,errors
 browser.close()
print('PASS: fresh pages default to FY2025; all years, other years, unavailable-year and empty-year views update map, totals and records; pagination resets; reload, parent navigation, history and full-map links retain the year; desktop/mobile captures and no browser errors.')
print(out)
