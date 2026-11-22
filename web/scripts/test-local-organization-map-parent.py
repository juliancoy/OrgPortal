"""Read-only local fixture: selected labels and nodes open the largest parent."""
import os
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
nodes=[{'id':key,'name':name,'slug':None,'category':'company','financialAmount':amount} for key,name,amount in [
 ('parent-selected','Selected recipient',1e7),('parent-small','Small parent',1e6),('parent-large','Largest parent',1e9),('parent-child','Larger child',1e12)]]
edges=[{'id':source+target,'source':source,'target':target,'recordCount':1,'kinds':['transfer']} for source,target in [('parent-small','parent-selected'),('parent-large','parent-selected'),('parent-selected','parent-child')]]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100},reduced_motion='reduce')
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
  page.locator(f'.organization-ecomap canvas[data-mode="{mode}"][data-ready="true"][data-anchor="{anchor}"]').wait_for(timeout=60000)
  page.wait_for_function('!document.querySelector(".organization-ecomap canvas").dataset.transitioning')
 def label(name):return page.locator('.organization-ecomap-labels').get_by_role('button',name=name,exact=True)
 def same_canvas():assert page.evaluate('window.originalMapCanvas===document.querySelector(".organization-ecomap canvas")')
 for mode in ['2d','3d']:
  page.goto(base+'/ecosystem/organizations/parent-selected',wait_until='domcontentloaded');ready('2d','parent-selected')
  if mode=='3d':page.get_by_label('Map mode',exact=True).select_option(mode);ready(mode,'parent-selected')
  page.get_by_label('Color by',exact=True).select_option('volume')
  page.evaluate('window.originalMapCanvas=document.querySelector(".organization-ecomap canvas")')
  # A selected label chooses the largest incoming node, not the still larger child.
  label('Selected recipient').click();ready(mode,'parent-large')
  expect(page).to_have_url(base+'/ecosystem/organizations/parent-large?fy=2025');same_canvas()
  expect(page.get_by_label('Color by',exact=True)).to_have_value('volume')
  # A root with no incoming parents remains selected.
  label('Largest parent').click()
  page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  expect(page).to_have_url(base+'/ecosystem/organizations/parent-large?fy=2025')
  # Back preserves the renderer; clicking the actual center sphere follows the same path.
  page.go_back();ready(mode,'parent-selected');same_canvas()
  canvas=page.locator('.organization-ecomap canvas');box=canvas.bounding_box()
  canvas.click(position={'x':box['width']/2,'y':box['height']/2})
  ready(mode,'parent-large');same_canvas()
  # Crowded labels can be omitted after recentering; search still selects any neighbor.
  page.get_by_label('Find a node').fill('Selected recipient')
  page.locator('.organization-ecomap-search').get_by_role('button',name='Selected recipient',exact=True).click();ready(mode,'parent-selected')
  page.get_by_label('Find a node').fill('Small parent')
  page.locator('.organization-ecomap-search').get_by_role('button',name='Small parent',exact=True).click()
  ready(mode,'parent-small');same_canvas()
 assert not errors,errors
 browser.close()
print('PASS: selected labels and actual canvas nodes open the largest incoming parent in 2D and 3D; no-parent selection stays put; direct navigation, history, color mode and canvas continuity are preserved; no browser errors.')
