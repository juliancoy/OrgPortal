"""Synthetic local hub-layout review: worker lifetime, navigation and display continuity."""
import pathlib,re,json
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
base='https://localhost:8443'
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-quality';out.mkdir(parents=True,exist_ok=True)
def node(id):return {'id':id,'name':id,'slug':None,'recordCount':0,'category':'government' if 'Hub' in id else 'company','financialAmount':5000000 if 'Hub' in id else 500000,'receivedUsd':400000}
meta={'version':'hub-fixture','generatedAt':'2026-11-23','fiscalYears':[2025,2024]}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 c=b.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100},device_scale_factor=2,reduced_motion='reduce')
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
 def inspect_renderer(route):
  response=route.fetch();body=response.text();assert 'return api' in body
  body=body.replace('return api', 'window.qualityProbe=()=>({ratio:renderer.getPixelRatio(),segments:geometries[0].parameters.widthSegments});return api',1)
  route.fulfill(response=response,body=body)
 c.route('**/src/features/ecosystem/webgpu-3d-renderer.js*',inspect_renderer)
 page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' and ('React' in m.text or 'TypeError' in m.text) else None)
 page.goto(base+'/ecosystem/organizations/Root?childDepth=2',wait_until='domcontentloaded');panel=page.locator('.organization-ecomap')
 def ready():
  try:panel.locator('canvas[data-ready="true"]').wait_for(timeout=30000)
  except Exception:
   print('Browser errors:',errors,'Page:',page.locator('body').inner_text());page.screenshot(path=str(out/'failure.png'));raise
  page.wait_for_function('()=>{const c=document.querySelector(".organization-ecomap canvas");return c?.dataset.ready&&!c.dataset.layoutPending&&!c.dataset.transitioning&&layoutWorkers===0}')
  page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
 ready()
 for width,name in [(1400,'desktop'),(390,'mobile')]:
  page.set_viewport_size({'width':width,'height':1100})
  for mode in ['2d','3d']:
   panel.get_by_label('Map mode',exact=True).select_option(mode);ready()
   panel.get_by_label('Title placement',exact=True).select_option('surface')
   if mode=='3d':
    assert page.evaluate('qualityProbe()')=={'ratio':2,'segments':32}
    # Slow active navigation used to trigger successive resolution/mesh cuts.
    page.evaluate("""async()=>{const c=document.querySelector('.organization-ecomap canvas');c.focus();for(let i=0;i<20;i++){c.dispatchEvent(new KeyboardEvent('keydown',{key:'d',code:'KeyD',bubbles:true}));const start=performance.now();while(performance.now()-start<40){};await new Promise(requestAnimationFrame)}c.dispatchEvent(new KeyboardEvent('keyup',{key:'d',code:'KeyD',bubbles:true}))}""")
    assert page.evaluate('qualityProbe()')=={'ratio':2,'segments':32}
   panel.get_by_role('button',name='Fullscreen',exact=True).click();ready()
   assert page.evaluate("()=>{const c=document.querySelector('.organization-ecomap canvas'),r=c.getBoundingClientRect();return Math.abs(c.width-r.width*devicePixelRatio)<=2&&Math.abs(c.height-r.height*devicePixelRatio)<=2}")
   if mode=='3d':assert page.evaluate('qualityProbe()')=={'ratio':2,'segments':32}
   panel.locator('.organization-ecomap-canvas').screenshot(path=str(out/f'{name}-{mode}.png'));page.keyboard.press('Escape')
 assert not errors,errors;b.close()
print('PASS: native 2x backing resolution in 2D/3D desktop/mobile/fullscreen; full sphere detail after induced slow navigation; no page errors.')
