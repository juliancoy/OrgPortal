"""Synthetic local hub-layout review: worker lifetime, navigation and display continuity."""
import pathlib,re,json
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from node_directory_fixture import install_node_directory_fixture
base='https://localhost:8443'
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-hubs';out.mkdir(parents=True,exist_ok=True)
def node(id):return {'id':id,'name':id,'slug':None,'recordCount':0,'category':'government' if 'Hub' in id else 'company','financialAmount':5000000 if 'Hub' in id else 500000,'receivedUsd':400000}
meta={'version':'hub-fixture','generatedAt':'2026-11-23','fiscalYears':[2025,2024]}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 c=b.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100},reduced_motion='reduce')
 c.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname=='localhost' and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 c.add_init_script('''window.layoutWorkers=0;const W=Worker;window.Worker=class extends W{constructor(...args){super(...args);this.active=true;layoutWorkers++}terminate(){if(this.active){this.active=false;layoutWorkers--}super.terminate()}}''')
 c.route('**/api/org/api/network/evidence-groups/public?*',lambda r:r.fulfill(json={'group':None}))
 def evidence(r):
  q=parse_qs(urlparse(r.request.url).query);r.fulfill(json={**meta,'fy':q.get('fy',['2025'])[0],'organization':node(q['org'][0]),'parents':[],'children':[],'groups':[],'records':[],'total':0,'offset':0,'nextOffset':None})
 c.route('**/api/ecosystem/organization-evidence?*',evidence);c.route('**/api/ecosystem/organization-group?*',evidence)
 def graph(r):
  q=parse_qs(urlparse(r.request.url).query);anchor=q['org'][0];levels=int(q.get('childDepth',['1'])[0]);nodes=[node(anchor)];edges=[]
  def add(a,id):
   if id==anchor:return
   nodes.append(node(id));edges.append({'id':a+id,'source':a,'target':id,'recordCount':1,'kinds':['transfer']})
  for branch in range(4):
   hub=f'Hub {branch+1}';add(anchor,hub)
   if levels>1:
    for leaf in range(6):add(hub,f'Branch {branch+1} · Node {leaf+1}')
    if levels>2:
     for leaf in range(3):add(f'Branch {branch+1} · Node 1',f'Third level {branch+1}.{leaf+1}')
  r.fulfill(json={**meta,'fy':q.get('fy',['2025'])[0],'parentDepth':int(q.get('parentDepth',['1'])[0]),'childDepth':levels,'anchor':anchor,'organizations':nodes,'relationships':edges,'total':len(nodes)-1,'incoming':0,'outgoing':len(nodes)-1,'offset':0,'nextOffset':None})
 c.route('**/api/ecosystem/organization-map?*',graph)
 install_node_directory_fixture(c)
 page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' and ('React' in m.text or 'TypeError' in m.text) else None)
 page.goto(base+'/ecosystem/organizations/Root?childDepth=2',wait_until='domcontentloaded');panel=page.locator('.organization-ecomap')
 def ready():
  try:panel.locator('canvas[data-ready="true"]').wait_for(timeout=30000)
  except Exception:
   print('Browser errors:',errors,'Page:',page.locator('body').inner_text());page.screenshot(path=str(out/'failure.png'));raise
  page.wait_for_function('()=>{const c=document.querySelector(".organization-ecomap canvas");return c?.dataset.ready&&!c.dataset.layoutPending&&!c.dataset.transitioning&&layoutWorkers===0}')
  page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
 ready();page.evaluate('window.canvasBefore=document.querySelector(".organization-ecomap canvas")')
 panel.get_by_label('Map layout',exact=True).select_option('hubs');ready()
 assert page.evaluate('canvasBefore===document.querySelector(".organization-ecomap canvas")')
 panel.get_by_label('Color by',exact=True).select_option('volume');panel.get_by_label('Cash flow amounts',exact=True).select_option('show')
 for spacing in ['.8','1.5','1']:
  panel.get_by_label('Hub spacing',exact=True).select_option(str(float(spacing)) if spacing!='1' else '1');ready()
 panel.get_by_label('Fiscal year',exact=True).select_option('2024');ready();expect(panel.get_by_label('Map layout',exact=True)).to_have_value('hubs');expect(panel.get_by_label('Color by',exact=True)).to_have_value('volume')
 panel.get_by_label('Color by',exact=True).select_option('category')
 for width,name,theme in [(1400,'desktop','light'),(390,'mobile','dark')]:
  page.set_viewport_size({'width':width,'height':1100});page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
  for mode in ['2d','3d']:
   panel.get_by_label('Map mode',exact=True).select_option(mode);ready();panel.screenshot(path=str(out/f'{name}-{mode}.png'))
   if name=='desktop' and mode=='2d':
    for hub in range(1,5):expect(panel.locator('.organization-ecomap-labels').get_by_role('button',name=f'Hub {hub}',exact=True)).to_be_visible()
   panel.get_by_role('button',name='Fullscreen',exact=True).click();expect(panel.get_by_label('Hub spacing',exact=True)).to_be_visible();ready();panel.screenshot(path=str(out/f'{name}-{mode}-fullscreen.png'));page.keyboard.press('Escape')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.set_viewport_size({'width':1400,'height':1100});panel.get_by_label('Child levels',exact=True).select_option('3');expect(panel.locator('.organization-ecomap-summary')).to_contain_text('All 40 connected nodes');ready();panel.screenshot(path=str(out/'three-levels.png'))
 panel.get_by_label('Hub spacing',exact=True).select_option('1.5');ready()
 # Search uses the real selection path and keeps layout, spacing and dimensions.
 panel.get_by_placeholder('Organization name').fill('Branch 1 · Node 2')
 panel.locator('.organization-ecomap-search').get_by_role('button',name='Branch 1 · Node 2',exact=True).click();page.wait_for_url(re.compile('.*Branch.*'));expect(panel.locator('canvas')).to_have_attribute('data-anchor','Branch 1 · Node 2');ready()
 expect(panel.get_by_label('Map layout',exact=True)).to_have_value('hubs');expect(panel.get_by_label('Hub spacing',exact=True)).to_have_value('1.5');expect(panel.get_by_label('Map mode',exact=True)).to_have_value('3d')
 page.go_back();expect(panel.locator('canvas')).to_have_attribute('data-anchor','Root');ready();expect(panel.get_by_label('Hub spacing',exact=True)).to_have_value('1.5')
 page.reload(wait_until='domcontentloaded');ready();expect(panel.get_by_label('Map layout',exact=True)).to_have_value('hubs');expect(panel.get_by_label('Hub spacing',exact=True)).to_have_value('1.5')
 panel.get_by_label('Map layout',exact=True).select_option('radial');ready();expect(panel.get_by_label('Hub spacing',exact=True)).to_have_count(0)
 assert not errors,errors;b.close()
print('PASS: particle layouts in 2D/3D; spacing, year/color continuity, mobile/fullscreen, 3 levels, node navigation/history/reload, worker disposal. Captures:',out)
