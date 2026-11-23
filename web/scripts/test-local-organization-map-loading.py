"""Read-only local fixture: partial maps stay usable while later pages wait/fail."""
import os
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
nodes=[{'id':f'loading-{i}','name':f'Loading organization {i}','slug':None,'category':'company','financialAmount':1e6} for i in range(5)]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce')
 ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ['localhost','127.0.0.1','::1'] and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 ctx.route('**/api/org/api/network/evidence-groups/public?*',lambda r:r.fulfill(json={'group':None}))
 profile={'version':'loading-fixture','generatedAt':'2026-11-22','organization':{**nodes[0],'recordCount':0},'parents':[],'children':[],'groups':[],'records':[],'total':0,'offset':0,'nextOffset':None}
 ctx.route('**/api/ecosystem/organization-evidence?*',lambda r:r.fulfill(json=profile))
 ctx.route('**/api/ecosystem/organization-group?*',lambda r:r.fulfill(json=profile))
 held=[];requests=[]
 def payload(offset):
  selected=nodes[1:3] if offset==0 else nodes[3:]
  return {'version':'loading-fixture','generatedAt':'2026-11-22','fy':'2025','anchor':nodes[0]['id'],'organizations':[nodes[0],*selected],'relationships':[{'id':n['id'],'source':nodes[0]['id'],'target':n['id'],'recordCount':1,'kinds':['transfer']} for n in selected],'total':4,'incoming':0,'outgoing':4,'offset':offset,'nextOffset':2 if offset==0 else None}
 def neighborhood(route):
  offset=int(parse_qs(urlparse(route.request.url).query)['offset'][0]);requests.append(offset)
  if offset:held.append(route)
  else:route.fulfill(json=payload(0))
 ctx.route('**/api/ecosystem/organization-map?*',neighborhood)
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/ecosystem/organizations/loading-0?fy=2025',wait_until='domcontentloaded')
 panel=page.locator('.organization-ecomap');canvas=panel.locator('canvas')
 def ready(mode):
  try:panel.locator(f'canvas[data-ready="true"][data-mode="{mode}"]').wait_for(timeout=10000)
  except Exception:
   print('FAILURE',page.url,requests,errors,page.locator('body').inner_text(),flush=True);raise
 ready('2d')
 expect(panel.get_by_role('status')).to_contain_text('Showing 2 of 4 adjacent nodes')
 assert held and requests==[0,2]
 panel.get_by_label('Map mode',exact=True).select_option('3d')
 ready('3d')
 page.evaluate('window.originalMapCanvas=document.querySelector(".organization-ecomap canvas")')
 panel.get_by_label('Color by',exact=True).select_option('volume')
 panel.get_by_role('button',name='Fullscreen',exact=True).click(timeout=5000)
 ready('3d')
 held.pop().fulfill(status=503,json={'error':'Temporary fixture outage'})
 expect(panel.get_by_role('alert')).to_be_visible()
 expect(panel.get_by_role('status')).to_contain_text('Loading stopped. Showing 2 of 4')
 panel.get_by_role('button',name='Retry map').click()
 expect(panel.get_by_role('status')).to_contain_text('Loading connections: 2 of 4')
 page.wait_for_function('document.querySelector(".organization-ecomap canvas").dataset.ready==="true"')
 assert requests==[0,2,0,2],'Partial or failed maps must not enter the complete-map cache'
 assert held
 held.pop().fulfill(json=payload(2))
 expect(panel.get_by_role('status')).to_contain_text('All 4 adjacent nodes')
 ready('3d')
 expect(panel.get_by_label('Color by',exact=True)).to_have_value('volume')
 assert page.evaluate('window.originalMapCanvas===document.querySelector(".organization-ecomap canvas")')
 assert not errors,errors
 print('PASS: first-page map before completion, 3D controls, error/retry, complete pagination and persistent canvas/settings')
 browser.close()
