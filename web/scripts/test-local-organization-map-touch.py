"""Read-only local fixture: selected labels and nodes open the largest parent."""
import os
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
nodes=[{'id':key,'name':name,'slug':None,'category':'company','financialAmount':amount} for key,name,amount in [
 ('parent-selected','Selected recipient',1e7),('parent-small','Small parent',1e7),('parent-large','Largest parent',1e8),('parent-child','Child',1e7)]]
edges=[{'id':source+target,'source':source,'target':target,'recordCount':1,'kinds':['transfer']} for source,target in [('parent-small','parent-selected'),('parent-large','parent-selected'),('parent-selected','parent-child')]]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=3,reduced_motion='reduce')
 ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ['localhost','127.0.0.1','::1'] and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 ctx.route('**/api/org/api/network/evidence-groups/public?*',lambda r:r.fulfill(json={'group':None}))
 def profile(route):
  handle=parse_qs(urlparse(route.request.url).query)['org'][0]
  org=next(n for n in nodes if n['id']==handle)
  route.fulfill(json={'version':'parent-fixture','generatedAt':'2026-11-22','organization':{**org,'recordCount':0},'parents':[],'children':[],'groups':[],'records':[],'total':0,'offset':0,'nextOffset':None})
 ctx.route('**/api/ecosystem/organization-evidence?*',profile)
 ctx.route('**/api/ecosystem/organization-group?*',profile)
 def neighborhood(route):
  anchor=parse_qs(urlparse(route.request.url).query)['org'][0]
  links=[e for e in edges if anchor in [e['source'],e['target']]]
  ids={anchor}|{e[k] for e in links for k in ['source','target']}
  route.fulfill(json={'version':'parent-fixture','generatedAt':'2026-11-22','anchor':anchor,'organizations':[n for n in nodes if n['id'] in ids],'relationships':links,'total':len(ids)-1,'incoming':sum(e['target']==anchor for e in links),'outgoing':sum(e['source']==anchor for e in links),'offset':0,'nextOffset':None})
 ctx.route('**/api/ecosystem/organization-map?*',neighborhood)
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def ready(mode,anchor):
  page.locator(f'.organization-ecomap canvas[data-mode="{mode}"][data-ready="true"][data-anchor="{anchor}"]').wait_for(timeout=20000)
  page.wait_for_function('!document.querySelector(".organization-ecomap canvas").dataset.transitioning')
 def label(name):return page.locator('.organization-ecomap-labels').get_by_role('button',name=name,exact=True)
 def same_canvas():assert page.evaluate('window.originalMapCanvas===document.querySelector(".organization-ecomap canvas")')
 cdp=ctx.new_cdp_session(page)
 def touch(kind,points):
  cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':x,'y':y,'id':i} for i,x,y in points]})
 def center():
  box=page.locator('.organization-ecomap canvas').bounding_box()
  return box['x']+box['width']/2,box['y']+box['height']/2
 def settled():page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 for mode,navigation in [('3d','orbit'),('3d','fly'),('2d',None)]:
  page.goto(base+'/ecosystem/organizations/parent-selected',wait_until='domcontentloaded');ready('2d','parent-selected')
  panel=page.locator('.organization-ecomap')
  if mode=='3d':
   panel.get_by_label('Map mode',exact=True).select_option(mode);ready(mode,'parent-selected')
   panel.get_by_label('Navigation',exact=True).select_option(navigation)
  panel.get_by_role('button',name='Fullscreen',exact=True).click()
  page.locator('.organization-ecomap canvas').scroll_into_view_if_needed();settled()
  page.evaluate('window.originalMapCanvas=document.querySelector(".organization-ecomap canvas")')
  panel.get_by_label('Color by',exact=True).select_option('volume')
  x,y=center();page.touchscreen.tap(x,y);ready(mode,'parent-large');same_canvas()
  page.go_back();ready(mode,'parent-selected')
  panel.get_by_role('button',name='Fit all connections',exact=True).click();settled()
  # Tap a neighboring sphere itself, including when titles are rendered on spheres.
  if mode=='3d':
   target=page.locator('.organization-ecomap-labels button:not([hidden]):not([data-node-id="parent-selected"])').first
   expect(target).to_be_visible()
   target_id=target.get_attribute('data-node-id')
   point=target.evaluate('(e)=>{const c=e.closest(".organization-ecomap-canvas").getBoundingClientRect();return {x:c.x+parseFloat(e.style.left),y:c.y+parseFloat(e.style.top)-12}}')
   x,y=point['x'],point['y']
   panel.get_by_label('Title placement',exact=True).select_option('surface');settled()
  else:x,y=center();target_id='parent-large'
  touch('touchStart',[(1,x,y)]);touch('touchMove',[(1,x+8,y)]);touch('touchEnd',[])
  ready(mode,target_id);same_canvas()
  expect(panel.get_by_label('Color by',exact=True)).to_have_value('volume')
  page.go_back();ready(mode,'parent-selected')
  panel.get_by_label('Title placement',exact=True).select_option('surface');settled()
  # Moving out and back remains a drag, even if release is at the starting point.
  x,y=center();url=page.url
  touch('touchStart',[(1,x,y)]);touch('touchMove',[(1,x+40,y)]);touch('touchMove',[(1,x,y)]);touch('touchEnd',[]);settled()
  assert page.url==url,'Drag returning to its origin selected a node'
  # A second finger cancels selection for the whole gesture, in either release order.
  for primary_first in [False,True]:
   touch('touchStart',[(1,x,y)])
   touch('touchStart',[(1,x,y),(2,x+45,y+30)])
   touch('touchMove',[(1,x,y),(2,x+70,y+50)])
   touch('touchEnd',[(2,x+70,y+50)] if primary_first else [(1,x,y)])
   touch('touchEnd',[]);settled();assert page.url==url,'Pinch selected a node'
  touch('touchStart',[(1,x,y)]);touch('touchCancel',[]);settled();assert page.url==url
  panel.get_by_label('Title placement',exact=True).select_option('floating')
  panel.get_by_role('button',name='Fit all connections',exact=True).click();settled()
  target=page.locator('.organization-ecomap-labels button:not([hidden]):not([data-node-id="parent-selected"])').first;target_id=target.get_attribute('data-node-id')
  target.tap();ready(mode,target_id);same_canvas()
  print('PASS',mode,navigation,'sphere taps, finger drift, labels, drag, pinch, cancellation, fullscreen and canvas continuity',flush=True)
 assert not errors,errors
 browser.close()
