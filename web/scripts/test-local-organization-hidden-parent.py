"""Read-only regression: Blue Collar's off-year DBM link remains navigable."""
import os
from urllib.parse import urlparse, urlencode, quote, parse_qs
from playwright.sync_api import sync_playwright, expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
parent='source-label:maryland_comptroller:agency:2c14d9d7e3e975a0666b6a99f262de2c'
recipients=['source-label:maryland_comptroller:recipient:'+id for id in ['4dfe38d6c817dc636347a44eea32e0fb','153c735d5d37c81802179cb60b38c7f0']]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100},reduced_motion='reduce')
 ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ['localhost','127.0.0.1','::1'] and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def ready(anchor,mode):
  page.locator(f'.organization-ecomap canvas[data-ready="true"][data-anchor="{anchor}"][data-mode="{mode}"]').wait_for(timeout=60000)
  page.wait_for_function('()=>{const c=document.querySelector(".organization-ecomap canvas");return c?.dataset.ready==="true"&&!c.dataset.transitioning}')
 for recipient in recipients:
  response=ctx.request.get(base+'/api/ecosystem/organization-map?'+urlencode({'org':recipient,'fy':'2025'}))
  assert response.ok,response.text()
  data=response.json()
  assert data['hiddenParent']['id']==parent
  assert data['total']==0 and data['incoming']==0 and not data['relationships']
  assert [n['id'] for n in data['organizations']]==[recipient]
  name=data['organizations'][0]['name']
  for mode in ['2d','3d']:
   page.goto(base+'/ecosystem/organizations/'+quote(recipient,safe='')+'?fy=2025',wait_until='domcontentloaded')
   ready(recipient,'2d')
   if mode=='3d':page.get_by_label('Map mode',exact=True).select_option(mode);ready(recipient,mode)
   expect(page.locator('.organization-ecomap')).to_contain_text('No documented connections for FY2025.')
   expect(page.locator('.organization-ecomap')).to_contain_text('Click the selected node to return to Department of Budget and Management.')
   page.get_by_label('Title placement',exact=True).select_option('floating' if mode=='2d' else 'surface')
   if mode=='2d':
    page.locator('.organization-ecomap-labels').get_by_role('button',name=name,exact=True).click()
   else:
    canvas=page.locator('.organization-ecomap canvas');box=canvas.bounding_box()
    canvas.click(position={'x':box['width']/2,'y':box['height']/2})
   ready(parent,mode)
   expect(page.get_by_label('Fiscal year',exact=True)).to_have_value('2025')
   assert parse_qs(urlparse(page.url).query)['fy']==['2025']
   page.go_back();ready(recipient,mode)
   expect(page.locator('.organization-ecomap')).to_contain_text('No documented connections for FY2025.')
 assert not errors,errors
 browser.close()
print('PASS: both Blue Collar approval aliases retain a single-node FY2025 map; selected labels (2D) and sphere clicks (3D) navigate to DBM across hidden years; year, renderer and back navigation remain intact; no browser errors.')
