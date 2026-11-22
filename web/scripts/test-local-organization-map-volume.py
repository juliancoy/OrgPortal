"""Read-only local integration and visual checks for organization volume colors."""
import json,os,pathlib
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect

base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-map-volume';out.mkdir(parents=True,exist_ok=True)
target='/ecosystem/organizations/source-label%3Amaryland_comptroller%3Aagency%3A14aa88b77dfd301a1a96d03621dbdb9e'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100})
 ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ['localhost','127.0.0.1','::1'] and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def ready(mode):page.locator(f'.organization-ecomap canvas[data-mode="{mode}"][data-ready="true"]').wait_for(timeout=60000)
 # Verify the live local projection supplies source metrics, not extra per-node requests.
 data=ctx.request.get(base+'/api/ecosystem/organization-map?org=source-label%3Amaryland_comptroller%3Aagency%3A14aa88b77dfd301a1a96d03621dbdb9e&limit=250').json()
 assert all('financialAmount' in n for n in data['organizations'])
 assert any((n['financialAmount'] or 0)>0 for n in data['organizations'])
 page.goto(base+target,wait_until='domcontentloaded');ready('2d')
 expect(page.locator('.organization-ecomap-volume-legend')).to_have_count(0)
 page.get_by_label('Map mode',exact=True).select_option('3d');ready('3d')
 page.get_by_label('Color by',exact=True).select_option('volume')
 expect(page.locator('.organization-ecomap-volume-legend')).to_contain_text('recorded USD volume')
 expect(page.locator('.organization-ecomap-labels button[title*="recorded USD volume"]:visible').first).to_be_visible()
 page.locator('.organization-ecomap').screenshot(path=str(out/'dgs-3d.png'))
 # Controlled public fixture makes all ends of the ramp visible in the real renderer.
 amounts=[1e12,0,1e3,1e6,1e9,None]
 nodes=[{'id':f'volume-{i}','name':name,'slug':None,'category':['company','university','health','funding','state-government','general'][i],'financialAmount':amount} for i,(name,amount) in enumerate(zip(['Maximum $1T','Zero disclosed','Low $1K','Middle $1M','High $1B','Undisclosed'],amounts))]
 fixture={'version':'volume-fixture','generatedAt':'2026-11-22','anchor':nodes[0]['id'],'organizations':nodes,'relationships':[{'id':str(i),'source':nodes[0]['id'],'target':n['id'],'recordCount':1,'kinds':['transfer']} for i,n in enumerate(nodes[1:])],'total':5,'incoming':0,'outgoing':5,'offset':0,'nextOffset':None}
 requests=[];page.on('request',lambda r:requests.append(r.url) if '/api/ecosystem/organization-map?' in r.url else None)
 ctx.route('**/api/ecosystem/organization-map?*',lambda r:r.fulfill(status=200,content_type='application/json',body=json.dumps(fixture)))
 page.reload(wait_until='domcontentloaded');ready('2d');page.get_by_label('Map mode',exact=True).select_option('3d');ready('3d')
 # Color changes repaint in place without moving nodes, refetching, or replacing the canvas.
 page.evaluate('window.originalMapCanvas=document.querySelector(".organization-ecomap canvas")')
 canvas=page.locator('.organization-ecomap canvas');labels=page.locator('.organization-ecomap-labels')
 expect(page.get_by_label('Color by',exact=True)).to_have_value('category')
 expect(page.locator('.organization-ecomap-category-legend')).to_contain_text('university')
 page.locator('.organization-ecomap').screenshot(path=str(out/'fixture-category-3d.png'))
 category_pixels=canvas.screenshot();positions=labels.locator('button:visible').evaluate_all('(nodes)=>nodes.map(n=>[n.dataset.nodeId,n.style.left,n.style.top])');request_count=len(requests)
 page.get_by_label('Color by',exact=True).select_option('volume')
 page.wait_for_function('document.querySelector(".organization-ecomap-labels button")?.dataset.colorScheme==="volume"')
 assert canvas.screenshot()!=category_pixels,'3D colors did not change'
 assert labels.locator('button:visible').evaluate_all('(nodes)=>nodes.map(n=>[n.dataset.nodeId,n.style.left,n.style.top])')==positions,'Color change moved the camera or layout'
 assert page.evaluate('originalMapCanvas===document.querySelector(".organization-ecomap canvas")')
 assert len(requests)==request_count,'Color change fetched data'
 labels=page.locator('.organization-ecomap-labels')
 expect(labels.get_by_role('button',name='Maximum $1T',exact=True)).to_have_attribute('title','Maximum $1T · $1,000,000,000,000 recorded USD volume')
 expect(labels.get_by_role('button',name='Undisclosed',exact=True)).to_have_attribute('title','Undisclosed · USD volume undisclosed')
 for theme in ['dark','light']:
  page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
  page.locator('.organization-ecomap').screenshot(path=str(out/f'fixture-{theme}.png'))
 page.set_viewport_size({'width':390,'height':844})
 page.locator('.organization-ecomap').screenshot(path=str(out/'fixture-mobile.png'))
 assert page.locator('.organization-ecomap-volume-legend').evaluate('(e)=>e.scrollWidth<=e.clientWidth')
 page.get_by_label('Map mode',exact=True).select_option('2d');ready('2d')
 expect(page.get_by_label('Color by',exact=True)).to_have_value('volume')
 volume_pixels=page.locator('.organization-ecomap canvas').screenshot()
 page.get_by_label('Color by',exact=True).select_option('category')
 page.wait_for_function('document.querySelector(".organization-ecomap-labels button")?.dataset.colorScheme==="category"')
 expect(page.locator('.organization-ecomap-volume-legend')).to_have_count(0)
 assert page.locator('.organization-ecomap canvas').screenshot()!=volume_pixels,'2D colors did not change'
 page.locator('.organization-ecomap').screenshot(path=str(out/'fixture-category-mobile.png'))
 page.get_by_label('Map mode',exact=True).select_option('3d');ready('3d')
 expect(page.get_by_label('Color by',exact=True)).to_have_value('category')
 assert len(requests)==request_count,'Changing colors or map modes fetched data'
 assert not errors,errors
 browser.close()
print('PASS: local master volume projection, 3D legend and volume tooltips, unknown versus zero, light/dark/mobile rendering, category/volume switching in both modes without refetch or camera reset')
print(out)
