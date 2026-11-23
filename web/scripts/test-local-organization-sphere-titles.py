"""Read-only synthetic rendering check: curved titles, gravity and navigation."""
import json, math, os, pathlib
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-sphere-titles'
out.mkdir(parents=True,exist_ok=True)
nodes=[{'id':id,'name':name,'slug':None,'category':category,'financialAmount':amount} for id,name,category,amount in [
 ('title-state','State of Maryland','state-government',1e10),('title-health','Maryland Department of Health','health',4e9),
 ('title-umd','University of Maryland','university',2e9),('title-small','Small recipient','company',1e5),('title-unknown','Undisclosed recipient','general',None)]]
edges=[{'id':n['id'],'source':'title-state','target':n['id'],'recordCount':1,'kinds':['transfer']} for n in nodes[1:]]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100},reduced_motion='reduce')
 ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ['localhost','127.0.0.1','::1'] and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 ctx.route('**/api/org/api/network/evidence-groups/public?*',lambda r:r.fulfill(json={'group':None}))
 def profile(route):
  handle=parse_qs(urlparse(route.request.url).query)['org'][0];org=next(n for n in nodes if n['id']==handle)
  route.fulfill(json={'version':'titles-fixture','generatedAt':'2026-11-22','organization':{**org,'recordCount':0},'parents':[],'children':[],'groups':[],'records':[],'total':0,'offset':0,'nextOffset':None})
 ctx.route('**/api/ecosystem/organization-evidence?*',profile);ctx.route('**/api/ecosystem/organization-group?*',profile)
 def neighborhood(route):
  anchor=parse_qs(urlparse(route.request.url).query)['org'][0];links=[e for e in edges if anchor in [e['source'],e['target']]]
  ids={anchor}|{e[k] for e in links for k in ['source','target']}
  route.fulfill(json={'version':'titles-fixture','generatedAt':'2026-11-22','anchor':anchor,'organizations':[n for n in nodes if n['id'] in ids],
   'relationships':links,'total':len(ids)-1,'incoming':sum(e['target']==anchor for e in links),'outgoing':sum(e['source']==anchor for e in links),'offset':0,'nextOffset':None})
 ctx.route('**/api/ecosystem/organization-map?*',neighborhood)
 ctx.add_init_script('''window.mapCircles=[];const arc=Path2D.prototype.arc;
 Path2D.prototype.arc=function(x,y,r,...rest){window.mapCircles.push({x,y,r});if(window.mapCircles.length>500)window.mapCircles.shift();return arc.call(this,x,y,r,...rest)};''')
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def ready(mode='2d',anchor='title-state'):
  page.locator(f'.organization-ecomap canvas[data-ready="true"][data-mode="{mode}"][data-anchor="{anchor}"]').wait_for(timeout=60000)
  page.wait_for_function('()=>{const c=document.querySelector(".organization-ecomap canvas");return c?.dataset.ready==="true"&&!c.dataset.transitioning}')
 def frames():page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
 def titles():
  frames()
  if page.locator('.organization-ecomap canvas').get_attribute('data-mode')=='3d':
   assert page.locator('.organization-ecomap-labels button:visible').count()==0
  else:
   page.wait_for_function('Number(document.querySelector(".organization-ecomap canvas")?.dataset.sphereTitles)>0 || document.querySelector(".organization-ecomap-labels button.on-circle:not([hidden])")',timeout=60000)
   assert page.locator('.organization-ecomap-labels button:visible:not(.on-circle)').count()==0
  assert page.locator('.organization-ecomap-labels button:visible').count()<=45
 def select(name,mode,anchor):
  page.get_by_label('Find a node',exact=True).fill(name)
  page.locator('.organization-ecomap-search').get_by_role('button',name=name,exact=True).click()
  ready(mode,anchor)
 page.goto(base+'/ecosystem/organizations/title-state',wait_until='domcontentloaded');ready()
 expect(page.get_by_label('Title placement',exact=True)).to_have_value('floating')
 page.evaluate('window.mapCircles=[]');page.get_by_role('button',name='Fit all connections',exact=True).click();frames()
 circles=page.evaluate('mapCircles')
 def distance(amount):
  radius=3+2*math.log10(1+amount/1000)
  circle=next(c for c in circles if (c['x'] or c['y']) and math.isclose(c['r'],radius,abs_tol=1e-8))
  return math.hypot(circle['x'],circle['y'])
 assert distance(4e9)<distance(1e5)
 page.get_by_label('Title placement',exact=True).select_option('surface');titles()
 for mode in ['2d','3d']:
  page.get_by_label('Map mode',exact=True).select_option(mode);ready(mode)
  expect(page.get_by_label('Title placement',exact=True)).to_have_value('surface')
  page.get_by_label('Color by',exact=True).select_option('volume')
  page.get_by_role('button',name='Fit all connections',exact=True).click()
  for _ in range(3):page.get_by_role('button',name='Zoom in on organization map',exact=True).click();frames()
  titles()
  for theme in ['light','dark']:
   page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
   page.locator('.organization-ecomap-canvas').screenshot(path=str(out/f'{mode}-surface-{theme}.png'))
  # Turning floating boxes back on removes all surface decals and restores labels.
  page.get_by_label('Title placement',exact=True).select_option('floating')
  page.wait_for_function('document.querySelector(".organization-ecomap canvas").dataset.sphereTitles==="0"')
  expect(page.locator('.organization-ecomap-labels').get_by_role('button',name='State of Maryland',exact=True)).to_be_visible()
  page.get_by_label('Title placement',exact=True).select_option('surface');titles()
  # Search and actual sphere clicks remain usable with adaptive surface titles.
  select('Maryland Department of Health',mode,'title-health');titles()
  expect(page.get_by_label('Title placement',exact=True)).to_have_value('surface')
  canvas=page.locator('.organization-ecomap canvas')
  page.get_by_role('button',name='Fit all connections',exact=True).click();frames()
  if mode=='2d':
   page.locator('.organization-ecomap-labels').get_by_role('button',name='State of Maryland',exact=True).click()
  else:
   # Locate the parent through its floating label, then remove that label and
   # click the sphere at the same camera position to exercise actual picking.
   page.get_by_label('Title placement',exact=True).select_option('floating');frames()
   label=page.locator('.organization-ecomap-labels').get_by_role('button',name='State of Maryland',exact=True).bounding_box()
   box=canvas.bounding_box();point={'x':label['x']+label['width']/2-box['x'],'y':label['y']-12-box['y']}
   page.get_by_label('Title placement',exact=True).select_option('surface');titles()
   canvas.click(position=point)
  ready(mode);titles()
  if mode=='3d':
   canvas.focus();page.keyboard.down('KeyD');page.wait_for_timeout(250);page.keyboard.up('KeyD');frames();titles()
   page.locator('.organization-ecomap-canvas').screenshot(path=str(out/'3d-surface-orbited.png'))
 page.set_viewport_size({'width':390,'height':1100});frames()
 page.get_by_role('button',name='Fit all connections',exact=True).click();frames()
 page.locator('.organization-ecomap').screenshot(path=str(out/'mobile-controls.png'))
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.reload(wait_until='domcontentloaded');ready('3d');expect(page.get_by_label('Title placement',exact=True)).to_have_value('surface')
 assert not errors,errors
 browser.close()
print('PASS: actual 2D geometry pulls larger amounts inward; exclusive surface/floating titles; toggling, colors, orbiting, search and sphere navigation, reload preference, mobile layout; no browser errors.')
print(out)
