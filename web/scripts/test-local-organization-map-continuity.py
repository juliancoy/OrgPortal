"""Local read-only regression: navigation retains the canvas and graphics context."""
import os,pathlib
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-map-continuity';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100})
 ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ['localhost','127.0.0.1','::1'] and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 ctx.add_init_script('''
 const native=HTMLCanvasElement.prototype.getContext;window.canvasContexts=new WeakMap();
 HTMLCanvasElement.prototype.getContext=function(...args){if(args[0]==='2d'||args[0]==='webgl2')window.canvasContexts.set(this,(window.canvasContexts.get(this)||0)+1);return native.apply(this,args)};
 window.mapRequests=[];const fetchOriginal=window.fetch;window.fetch=async function(input,options){
  const url=String(input);if(url.includes('/api/ecosystem/organization-map'))window.mapRequests.push(new URL(url,location.href).searchParams.get('org'));if(url.includes('/api/ecosystem/organization-map')&&(window.delayAllMaps||url.includes('source-label'))){
   await new Promise(resolve=>setTimeout(resolve,800));
   if(window.failMap){window.failMap=false;throw new Error('Simulated map connection failure')}
  }
  return fetchOriginal(input,options)
 };
 ''')
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/orgs/state-of-maryland',wait_until='domcontentloaded')
 def section(name):return page.get_by_role('region',name='EcoMap for '+name,exact=True)
 def ready(name):
  canvas=section(name).locator('canvas');expect(canvas).to_have_attribute('data-ready','true',timeout=60000)
  page.wait_for_function('()=>!document.querySelector(".organization-ecomap canvas")?.dataset.transitioning')
  return canvas
 def select(name):
  panel=page.locator('.organization-ecomap');panel.get_by_label('Find a node').fill(name)
  panel.locator('.organization-ecomap-search').get_by_role('button',name=name,exact=True).click()
 def remember():
  page.evaluate('''()=>{window.liveCanvas=document.querySelector('.organization-ecomap canvas');window.callsBefore=canvasContexts.get(liveCanvas);window.detached=false;
   window.observer?.disconnect();window.observer=new MutationObserver(()=>{if(!liveCanvas.isConnected)window.detached=true});observer.observe(document.body,{childList:true,subtree:true});}''')
 def continuous():
  assert page.evaluate('liveCanvas===document.querySelector(".organization-ecomap canvas")&&liveCanvas.isConnected&&!detached'),'Canvas was replaced or detached'
  assert page.evaluate('canvasContexts.get(liveCanvas)===callsBefore'),'Renderer recreated its graphics context'
 surface=ready('State of Maryland');remember()
 initial_requests=page.evaluate('mapRequests.filter(org=>org==="state-of-maryland").length')
 # A failed neighborhood request must leave the old map interactive and allow retry.
 page.evaluate('window.failMap=true');select('Comptroller of Maryland')
 expect(section('State of Maryland').get_by_role('status').first).to_contain_text('Updating connections',timeout=10000)
 continuous();expect(page.locator('.organization-ecomap').get_by_role('alert')).to_contain_text('Simulated map connection failure',timeout=10000)
 continuous();page.get_by_role('button',name='Retry map',exact=True).click()
 surface=ready('Comptroller of Maryland');continuous();expect(surface).to_be_focused()
 expect(surface).to_have_attribute('data-anchor',__import__('re').compile('^source-label:'))
 select('State of Maryland');ready('State of Maryland');continuous()
 # Preserve one GPU renderer across native and source-only organization pages.
 page.get_by_label('Map mode',exact=True).select_option('3d');surface=ready('State of Maryland')
 page.get_by_label('Navigation',exact=True).select_option('fly');page.get_by_label('Navigation speed',exact=True).select_option('0.25')
 remember();select('TEDCO');ready('TEDCO');continuous()
 page.go_back();ready('State of Maryland');continuous()
 select('Comptroller of Maryland');ready('Comptroller of Maryland');continuous()
 expect(page.get_by_label('Map mode',exact=True)).to_have_value('3d')
 expect(page.get_by_label('Navigation',exact=True)).to_have_value('fly')
 expect(page.get_by_label('Navigation speed',exact=True)).to_have_value('0.25')
 # Keyboard controls remain active after several graph replacements.
 surface=page.locator('.organization-ecomap canvas');surface.focus()
 before=page.locator('.organization-ecomap-labels').inner_html();page.keyboard.down('d')
 page.wait_for_function('(old)=>document.querySelector(".organization-ecomap-labels").innerHTML!==old',arg=before);page.keyboard.up('d')
 page.locator('.organization-ecomap').screenshot(path=str(out/'comptroller-3d.png'))
 # Rapidly superseding a delayed request must keep the most recent destination.
 select('State of Maryland');ready('State of Maryland')
 neighborhood=ctx.request.get(base+'/api/ecosystem/organization-map?org=state-of-maryland&limit=250').json()
 other=next(n for n in neighborhood['organizations'] if not n['slug'] and n['name']!='Comptroller of Maryland')
 page.evaluate('window.delayAllMaps=true');select(other['name'])
 expect(section('State of Maryland').get_by_role('status').first).to_contain_text('Updating connections')
 select('TEDCO');ready('TEDCO');page.wait_for_timeout(1000);continuous()
 expect(page.locator('.organization-ecomap canvas')).to_have_attribute('data-anchor','org-tedco')
 page.emulate_media(reduced_motion='reduce');page.go_back();page.go_back();ready('State of Maryland');continuous()
 assert page.evaluate('mapRequests.filter(org=>org==="state-of-maryland").length')==initial_requests,('Fresh cached neighborhoods should not refetch',page.evaluate('mapRequests'))
 assert page.evaluate('performance.getEntriesByType("navigation").length')==1
 assert not errors,errors
 browser.close()
print('PASS: same connected canvas and graphics context across 2D/3D node navigation; slow request and failure/retry retain map; back navigation; superseded requests; reduced motion; one-degree anchor; settings and keyboard controls; no document reload')
print(out)
