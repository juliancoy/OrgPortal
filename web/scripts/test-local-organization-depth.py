"""Synthetic local checks for independent parent/child levels and view continuity."""
import pathlib,re
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
base='https://localhost:8443'
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-depth';out.mkdir(parents=True,exist_ok=True)
def node(id):return {'id':id,'name':id,'slug':None,'recordCount':0,'category':'government' if id.startswith('Parent') else 'company','financialAmount':500000}
meta={'version':'depth-fixture','generatedAt':'2026-11-23','fiscalYears':[2025,2024]}
requests=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 c=b.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100},reduced_motion='reduce')
 c.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname=='localhost' and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 c.route('**/api/org/api/network/evidence-groups/public?*',lambda r:r.fulfill(json={'group':None}))
 def profile(r):
  q=parse_qs(urlparse(r.request.url).query);anchor=q['org'][0]
  r.fulfill(json={**meta,'fy':q.get('fy',['2025'])[0],'organization':node(anchor),'parents':[],'children':[],'groups':[],'records':[],'total':0,'offset':0,'nextOffset':None})
 c.route('**/api/ecosystem/organization-evidence?*',profile);c.route('**/api/ecosystem/organization-group?*',profile)
 def map_response(r):
  q=parse_qs(urlparse(r.request.url).query);requests.append(q);anchor=q['org'][0];up=int(q.get('parentDepth',['1'])[0]);down=int(q.get('childDepth',['1'])[0]);nodes=[node(anchor)];edges=[]
  for prefix,count in [('Parent',up),('Child',down)]:
   previous=anchor
   for level in range(1,count+1):
    id=f'{prefix} {level} of {anchor}';nodes.append(node(id));edges.append({'id':id,'source':id if prefix=='Parent' else previous,'target':previous if prefix=='Parent' else id,'recordCount':1,'kinds':['transfer']});previous=id
  r.fulfill(json={**meta,'fy':q.get('fy',['2025'])[0],'parentDepth':up,'childDepth':down,'anchor':anchor,'organizations':nodes,'relationships':edges,'total':up+down,'incoming':up,'outgoing':down,'offset':0,'nextOffset':None})
 c.route('**/api/ecosystem/organization-map?*',map_response)
 page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'React' in m.text else None)
 page.goto(base+'/ecosystem/organizations/Depth-fixture',wait_until='domcontentloaded')
 panel=page.locator('.organization-ecomap')
 def ready(up,down):
  expect(panel.get_by_label('Parent levels',exact=True)).to_have_value(str(up));expect(panel.get_by_label('Child levels',exact=True)).to_have_value(str(down))
  expect(panel.locator('.organization-ecomap-summary')).to_contain_text(f'All {up+down} connected nodes')
  panel.locator('canvas[data-ready="true"]').wait_for(timeout=30000)
  page.wait_for_function('()=>!document.querySelector(".organization-ecomap canvas")?.dataset.transitioning')
 ready(1,1)
 panel.get_by_label('Color by',exact=True).select_option('volume');panel.get_by_label('Navigation speed',exact=True).select_option('3')
 page.evaluate('window.originalCanvas=document.querySelector(".organization-ecomap canvas")')
 for up,down in [(2,1),(3,1),(3,2),(3,3),(2,3)]:
  panel.get_by_label('Parent levels',exact=True).select_option(str(up));panel.get_by_label('Child levels',exact=True).select_option(str(down));ready(up,down)
  assert page.evaluate('originalCanvas===document.querySelector(".organization-ecomap canvas")')
  expect(panel.get_by_label('Color by',exact=True)).to_have_value('volume');expect(panel.get_by_label('Navigation speed',exact=True)).to_have_value('3')
 panel.get_by_label('Fiscal year',exact=True).select_option('2024');ready(2,3)
 for width,name,theme in [(1400,'desktop','light'),(390,'mobile','dark')]:
  page.set_viewport_size({'width':width,'height':1100});page.evaluate('(x)=>document.documentElement.dataset.theme=x',theme)
  for mode in ['2d','3d']:
   panel.get_by_label('Map mode',exact=True).select_option(mode);panel.locator(f'canvas[data-mode="{mode}"][data-ready="true"]').wait_for(timeout=30000)
   panel.screenshot(path=str(out/f'{name}-{mode}.png'))
   panel.get_by_role('button',name='Fullscreen',exact=True).click();expect(panel.get_by_label('Parent levels',exact=True)).to_be_visible()
   panel.screenshot(path=str(out/f'{name}-{mode}-fullscreen.png'));page.keyboard.press('Escape')
   expect(panel.get_by_role('button',name='Fullscreen',exact=True)).to_be_visible()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.set_viewport_size({'width':1400,'height':1100})
 panel.locator('.organization-ecomap-labels').get_by_role('button',name='Child 1 of Depth-fixture',exact=True).click()
 page.wait_for_url(re.compile('.*Child.*'));ready(2,3)
 expect(panel.get_by_label('Map mode',exact=True)).to_have_value('3d');expect(panel.get_by_label('Color by',exact=True)).to_have_value('volume')
 page.go_back();ready(2,3);page.reload(wait_until='domcontentloaded');ready(2,3)
 assert requests[-1]['parentDepth']==['2'] and requests[-1]['childDepth']==['3']
 assert not errors,errors
 b.close()
print('PASS: defaults, independent 1–3 levels, correct requests, canvas continuity, color/speed/year preservation, node navigation, history/reload, desktop/mobile, 2D/3D and fullscreen. Captures:',out)
