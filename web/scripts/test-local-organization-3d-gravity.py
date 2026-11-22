"""Check actual renderer inputs for direct and worker-backed 3D layouts."""
import json, math, os, pathlib
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-3d-gravity'
out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100},reduced_motion='reduce')
 ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ['localhost','127.0.0.1','::1'] and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 ctx.route('**/api/org/api/network/evidence-groups/public?*',lambda r:r.fulfill(json={'group':None}))
 # Observe the exact nodes passed to the shared renderer. Only the local test
 # response is instrumented; application files and scene positions are untouched.
 def observe(route):
  response=route.fetch();body=response.text();needle='renderedNodes = nodes.filter'
  if needle not in body:needle='renderedNodes=nodes.filter'
  assert needle in body
  body=body.replace(needle,'window.__gravityNodes=nodes.map(n=>({id:n.id,x:n.x,y:n.y,z:n.z,r:n.renderRadius,amount:n.financialAmount}));'+needle,1)
  route.fulfill(response=response,body=body)
 ctx.route('**/src/features/ecosystem/webgpu-3d-renderer.js*',observe)
 nodes=[];edges=[]
 def profile(route):
  route.fulfill(json={'version':'gravity-fixture','generatedAt':'2026-11-22','organization':{**nodes[0],'recordCount':0},'parents':[],'children':[],'groups':[],'records':[],'total':0,'offset':0,'nextOffset':None})
 ctx.route('**/api/ecosystem/organization-evidence?*',profile);ctx.route('**/api/ecosystem/organization-group?*',profile)
 def neighborhood(route):
  offset=int(parse_qs(urlparse(route.request.url).query).get('offset',['0'])[0]);visible=nodes[1:][offset:offset+250];ids={n['id'] for n in visible}|{'gravity-center'}
  route.fulfill(json={'version':'gravity-fixture','generatedAt':'2026-11-22','anchor':'gravity-center','organizations':[nodes[0],*visible],'relationships':[e for e in edges if e['source'] in ids and e['target'] in ids],
   'total':len(nodes)-1,'incoming':sum(e['target']=='gravity-center' for e in edges),'outgoing':sum(e['source']=='gravity-center' for e in edges),'offset':offset,'nextOffset':offset+250 if offset+250<len(nodes)-1 else None})
 ctx.route('**/api/ecosystem/organization-map?*',neighborhood)
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));results=[]
 def ready(mode):
  page.locator(f'.organization-ecomap canvas[data-ready="true"][data-mode="{mode}"]').wait_for(timeout=60000)
  page.wait_for_function('()=>{const c=document.querySelector(".organization-ecomap canvas");return c?.dataset.ready==="true"&&!c.dataset.transitioning}')
 for count in [90,242]:
  nodes=[{'id':'gravity-center','name':'Selected state','slug':None,'category':'state-government','financialAmount':2e10}]+[
   {'id':f'n{i:03}','name':f'{"Large department" if i<6 else "Small recipient"} {i}','slug':None,'category':'company','financialAmount':1e10 if i<6 else 1e5} for i in range(count)]
  edges=[{'id':n['id'],'source':n['id'] if count>120 and i%2 else 'gravity-center','target':'gravity-center' if count>120 and i%2 else n['id'],'recordCount':1,'kinds':['transfer']} for i,n in enumerate(nodes[1:])]
  page.goto(base+'/ecosystem/organizations/gravity-center',wait_until='domcontentloaded');ready('2d')
  page.get_by_label('Map mode',exact=True).select_option('3d');ready('3d')
  actual=page.evaluate('window.__gravityNodes');assert len(actual)==len(nodes)
  distance=lambda n:math.sqrt(n['x']**2+n['y']**2+n['z']**2)
  large=[n for n in actual[1:] if n['amount']==1e10];small=[n for n in actual[1:] if n['amount']==1e5]
  mean=lambda ns:sum(distance(n) for n in ns)/len(ns)
  assert mean(large)<100 and mean(large)<mean(small)*.65,(mean(large),mean(small))
  assert actual[0]['x']==actual[0]['y']==actual[0]['z']==0
  assert any(abs(n['z'])>10 for n in large)
  for i,a in enumerate(actual):
   for b in actual[i+1:]:assert math.dist([a['x'],a['y'],a['z']],[b['x'],b['y'],b['z']])>a['r']+b['r']
  page.get_by_label('Color by',exact=True).select_option('volume')
  page.get_by_role('button',name='Fit all connections',exact=True).click()
  for _ in range(2):page.get_by_role('button',name='Zoom in on organization map',exact=True).click()
  page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  page.locator('.organization-ecomap-canvas').screenshot(path=str(out/f'gravity-{count}.png'))
  canvas=page.locator('.organization-ecomap canvas');canvas.focus();page.keyboard.down('KeyD');page.wait_for_timeout(250);page.keyboard.up('KeyD')
  page.get_by_label('Map mode',exact=True).select_option('2d');ready('2d')
  page.get_by_label('Map mode',exact=True).select_option('3d');ready('3d')
  assert page.evaluate('window.__gravityNodes')==actual
  results.append({'neighbors':count,'largeMeanRadius':mean(large),'smallMeanRadius':mean(small),'overlaps':0})
 assert not errors,errors
 browser.close()
print(json.dumps({'result':'pass','checks':results,'navigation':'orbit and 2D/3D round trip preserve positions; no browser errors'}))
print(out)
