"""Read-only synthetic money sizing checks against the local map renderers."""
import json,math,os,pathlib
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-map-sizing'
out.mkdir(parents=True,exist_ok=True)
nodes=[{'id':'size-small','name':'Small recipient','slug':None,'category':'company','financialAmount':1e6},
       {'id':'size-large','name':'Large payer','slug':None,'category':'university','financialAmount':1e9},
       {'id':'size-equal','name':'Equal volume','slug':None,'category':'health','financialAmount':1e6}]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100},reduced_motion='reduce')
 ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ['localhost','127.0.0.1','::1'] and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 ctx.route('**/api/org/api/network/evidence-groups/public?*',lambda r:r.fulfill(json={'group':None}))
 def profile(route):
  handle=parse_qs(urlparse(route.request.url).query)['org'][0]
  org=next(n for n in nodes if n['id']==handle)
  route.fulfill(json={'version':'size-fixture','generatedAt':'2026-11-22','organization':{**org,'recordCount':0},'parents':[],'children':[],'groups':[],'records':[],'total':0,'offset':0,'nextOffset':None})
 ctx.route('**/api/ecosystem/organization-evidence?*',profile)
 ctx.route('**/api/ecosystem/organization-group?*',profile)
 def neighborhood(route):
  anchor=parse_qs(urlparse(route.request.url).query)['org'][0]
  route.fulfill(json={'version':'size-fixture','generatedAt':'2026-11-22','anchor':anchor,'organizations':nodes,'relationships':[{'id':n['id'],'source':anchor,'target':n['id'],'recordCount':1,'kinds':['transfer']} for n in nodes if n['id']!=anchor],'total':2,'incoming':0,'outgoing':2,'offset':0,'nextOffset':None})
 ctx.route('**/api/ecosystem/organization-map?*',neighborhood)
 # Observe actual 2D drawing primitives, including the selected outline.
 ctx.add_init_script('''window.mapCircles=[];const arc=Path2D.prototype.arc;
 Path2D.prototype.arc=function(x,y,r,...rest){window.mapCircles.push({x,y,r});if(window.mapCircles.length>500)window.mapCircles.shift();return arc.call(this,x,y,r,...rest)};''')
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def ready(mode,anchor):
  page.locator(f'.organization-ecomap canvas[data-mode="{mode}"][data-ready="true"][data-anchor="{anchor}"]').wait_for(timeout=60000)
  page.wait_for_function('!document.querySelector(".organization-ecomap canvas").dataset.transitioning')
 def sizes():
  page.evaluate('window.mapCircles=[]')
  page.get_by_role('button',name='Fit all connections',exact=True).click()
  page.wait_for_function('mapCircles.length>=4')
  circles=page.evaluate('mapCircles')
  center=min(c['r'] for c in circles if c['x']==0 and c['y']==0)
  neighbors=sorted(set(round(c['r'],9) for c in circles if c['x']!=0 or c['y']!=0))
  return center,neighbors
 def select(name,mode,anchor):
  page.get_by_label('Find a node').fill(name)
  page.locator('.organization-ecomap-search').get_by_role('button',name=name,exact=True).click()
  ready(mode,anchor)
 page.goto(base+'/ecosystem/organizations/size-small',wait_until='domcontentloaded');ready('2d','size-small')
 center,neighbors=sizes()
 assert len(neighbors)==2 and math.isclose(center,neighbors[0],abs_tol=1e-8) and neighbors[1]>center,(center,neighbors)
 page.locator('.organization-ecomap').screenshot(path=str(out/'small-focus-2d.png'))
 page.evaluate('window.originalMapCanvas=document.querySelector(".organization-ecomap canvas")')
 select('Large payer','2d','size-large')
 large,small=sizes()
 assert math.isclose(large,neighbors[1],abs_tol=1e-8) and len(small)==1 and math.isclose(small[0],center,abs_tol=1e-8),(large,small,center,neighbors)
 assert page.evaluate('originalMapCanvas===document.querySelector(".organization-ecomap canvas")')
 select('Small recipient','2d','size-small')
 for color in ['volume','category']:
  page.get_by_label('Color by',exact=True).select_option(color)
  current,peers=sizes()
  assert math.isclose(current,center,abs_tol=1e-8) and peers==neighbors
 page.get_by_label('Map mode',exact=True).select_option('3d');ready('3d','size-small')
 expect(page.locator('.organization-ecomap')).to_contain_text('Node size: recorded USD volume')
 for theme in ['light','dark']:
  page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
  page.locator('.organization-ecomap').screenshot(path=str(out/f'small-focus-3d-{theme}.png'))
 select('Large payer','3d','size-large')
 page.locator('.organization-ecomap').screenshot(path=str(out/'large-focus-3d.png'))
 page.set_viewport_size({'width':390,'height':844})
 page.locator('.organization-ecomap').screenshot(path=str(out/'large-focus-mobile.png'))
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 browser.close()
print('PASS: actual 2D circles follow money, equal values have equal sizes, navigation preserves radii and canvas, colors do not change sizes; 3D navigation and desktop/mobile light/dark captures have no browser errors.')
print(out)
