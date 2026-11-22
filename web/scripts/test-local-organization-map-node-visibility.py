"""Read-only GPU regression: moving between large and small neighborhoods."""
import json,os,pathlib
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-map-node-visibility';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100})
 ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ['localhost','127.0.0.1','::1'] and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 ctx.add_init_script('''
 window.glFailures=[];window.glDraws=[];window.sphereDrawCounts=[];
 const draw=WebGL2RenderingContext.prototype.drawElementsInstanced;
 WebGL2RenderingContext.prototype.drawElementsInstanced=function(mode,count,type,offset,instances){
  draw.apply(this,arguments);const error=this.getError();
  if(error)glFailures.push({error,instances,count});
  if(instances===12&&!sphereDrawCounts.includes(count))sphereDrawCounts.push(count);
  glDraws.push({error,instances,count});if(glDraws.length>200)glDraws.shift();
 };
 ''')
 page=ctx.new_page();errors=[];warnings=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda e:warnings.append(e.text) if 'GL_' in e.text or 'WebGL' in e.text or 'THREE' in e.text else None)
 def ready():
  page.locator('.organization-ecomap canvas[data-mode="3d"][data-ready="true"]').wait_for(timeout=60000)
  page.wait_for_function('!document.querySelector(".organization-ecomap canvas").dataset.transitioning')
 def capture(name):
  page.locator('.organization-ecomap').screenshot(path=str(out/(name+'.png')))
  result={'draws':page.evaluate('glDraws.slice(-4)'),'failures':page.evaluate('glFailures'),'warnings':warnings.copy(),'errors':errors.copy()}
  (out/(name+'.json')).write_text(json.dumps(result,indent=2));print(name,json.dumps(result),flush=True)
 page.goto(base+'/ecosystem/organizations/source-label%3Amaryland_comptroller%3Aagency%3A14aa88b77dfd301a1a96d03621dbdb9e',wait_until='domcontentloaded')
 page.locator('.organization-ecomap canvas[data-ready="true"]').wait_for(timeout=60000)
 page.get_by_label('Map mode',exact=True).select_option('3d');ready();capture('large')
 page.evaluate('window.originalCanvas=document.querySelector(".organization-ecomap canvas")')
 def select(name):
  panel=page.locator('.organization-ecomap');panel.get_by_label('Find a node').fill(name)
  panel.locator('.organization-ecomap-search').get_by_role('button',name=name,exact=True).click()
  ready()
 select('MVS INC');capture('small-after-navigation')
 page.get_by_role('button',name='Fit all connections',exact=True).click();ready();capture('small-fitted')
 # Exercise increasing and decreasing detail, not just the initial threshold.
 for label in ['Zoom in on organization map','Zoom out on organization map']:
  for _ in range(6):
   page.get_by_role('button',name=label,exact=True).click();page.wait_for_timeout(150)
  capture('zoom-in' if label.startswith('Zoom in') else 'zoom-out')
 assert len(page.evaluate('sphereDrawCounts'))>=3,'Zoom did not exercise multiple geometry detail levels'
 select('Department of General Services');capture('large-return')
 assert any(draw['instances']==2528 for draw in page.evaluate('glDraws.slice(-4)'))
 assert page.evaluate('originalCanvas===document.querySelector(".organization-ecomap canvas")')
 assert not page.evaluate('glFailures'), 'GPU rejected draw calls; nodes may be missing'
 assert not errors,errors
 browser.close()
print('PASS: all GPU draw calls accepted across large/small navigation, fit, repeated zoom detail changes and return; canvas preserved')
