"""Review real map renderers with synthetic neighbors; only local GETs are allowed."""
import os,pathlib
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from PIL import Image,ImageDraw
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-map-grouping'
out.mkdir(parents=True,exist_ok=True)
html='''<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><main class="organization-ecomap" style="margin:16px"><h1>Organization map · synthetic direction groups</h1><div id="root"></div></main>
<script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
const {createElement:h,useState}=(await import('/node_modules/.vite/deps/react.js')).default;
const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
const {OrganizationMapCanvas}=await import('/src/ui/components/OrganizationMapCanvas.tsx');
const {defaultOrganizationMapView}=await import('/src/features/ecosystem/organizationMapNavigation.ts');
await import('/src/index.css');await import('/src/styles/theme-foundation.css');await import('/src/styles/themes/orgportal.css');await import('/src/ui/components/organization-ecomap.css');
const node=(id,name)=>({id,name,slug:null,category:'state-government'});
const organizations=[node('center','Central organization'),...Array.from({length:80},(_,i)=>({...node('n'+i,(i%2?'Downstream ':'Upstream ')+String(i+1).padStart(2,'0')),category:i%2?'state-government':'company'}))];
const data={version:'fixture',generatedAt:'2026-11-21',anchor:'center',organizations,relationships:[...organizations.slice(1).map((n,i)=>({id:n.id,source:i%2?'center':n.id,target:i%2?n.id:'center',recordCount:1,kinds:['agency']})),{id:'reciprocal',source:'center',target:'n0',recordCount:1,kinds:['agency']}],total:80,incoming:40,outgoing:41,offset:0,nextOffset:null};
function App(){const [mode,setMode]=useState('2d');return h(OrganizationMapCanvas,{data,mode,initialView:defaultOrganizationMapView,onModeChange:setMode,onSelect:()=>{}})}
createRoot(document.getElementById('root')).render(h(App));
</script></body></html>'''
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1200,'height':900})
 def route(request):
  url=urlparse(request.request.url)
  if url.hostname not in ['localhost','127.0.0.1','::1'] or request.request.method not in ['GET','HEAD']:request.abort()
  elif url.path=='/__map_review':request.fulfill(content_type='text/html',body=html)
  else:request.continue_()
 ctx.route('**/*',route)
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('Browser error:',e,flush=True)))
 page.goto(base+'/__map_review',wait_until='domcontentloaded')
 expect(page.locator('canvas')).to_have_attribute('data-ready','true',timeout=60000)
 surface=page.locator('canvas');labels=page.locator('.organization-ecomap-labels')
 def settled():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 shots=[]
 for mode in ['2d','3d']:
  page.get_by_role('combobox',name='Map mode').select_option(mode)
  expect(surface).to_have_attribute('data-mode',mode)
  expect(surface).to_have_attribute('data-ready','true',timeout=60000)
  if mode=='3d':assert surface.get_attribute('data-backend') in ['webgpu','webgl2']
  page.get_by_role('button',name='Fit all connections',exact=True).click();settled()
  for theme in ['light','dark']:
   page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
   for width in [1200,390]:
    page.set_viewport_size({'width':width,'height':900});settled();page.wait_for_timeout(300)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    shot=out/f'{mode}-{theme}-{width}.png';page.locator('main').screenshot(path=str(shot));shots.append(shot)
 page.get_by_role('combobox',name='Map mode').select_option('2d');expect(surface).to_have_attribute('data-ready','true')
 assert not errors,errors
 browser.close()
contact=Image.new('RGB',(1400,4*640),'#ddd')
for i,path in enumerate(shots):
 picture=Image.open(path).convert('RGB');picture.thumbnail((680,600));x,y=(i%2)*700+10,(i//2)*640+30
 ImageDraw.Draw(contact).text((x,y-20),path.name,fill='black');contact.paste(picture,(x,y))
contact.save(out/'contact.png')
print('PASS: 2D and 3D renderers; synthetic mixed-direction neighborhood; fit and mode switching; desktop/mobile, light/dark; no page errors or horizontal overflow.')
print(out/'contact.png')
