"""Read-only local checks of the real 2D/3D renderer and focused keyboard controls."""
import json,os,pathlib
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from PIL import Image,ImageDraw
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-map-navigation';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1440,'height':1100})
 ctx.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in ['localhost','127.0.0.1','::1'] and route.request.method in ['GET','HEAD','OPTIONS'] else route.abort())
 page=ctx.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.goto(base+'/orgs/state-of-maryland',wait_until='domcontentloaded')
 section=page.get_by_role('region',name='EcoMap for State of Maryland',exact=True);surface=section.locator('canvas');labels=section.locator('.organization-ecomap-labels')
 def settled():page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
 def signature():return labels.inner_html()
 def ready():
  expect(surface).to_have_attribute('data-ready','true',timeout=90000)
  page.wait_for_function('()=>!document.querySelector(".organization-ecomap canvas")?.dataset.transitioning')
 def movement(key):
  surface.focus();before=signature();page.keyboard.down(key)
  try:page.wait_for_function('(before)=>document.querySelector(".organization-ecomap-labels").innerHTML!==before',arg=before,timeout=10000)
  except Exception:
   section.screenshot(path=str(out/'movement-failure.png'))
   print('Movement failure:',key,surface.get_attribute('data-backend'),surface.get_attribute('data-ready'),'labels:',labels.inner_text(),'errors:',errors,flush=True)
   raise
  finally:page.keyboard.up(key)
  settled()
  assert signature()!=before,f'{key} did not move {surface.get_attribute("data-mode")}'
  stopped=signature();page.wait_for_timeout(120);assert signature()==stopped,f'{key} continued after release'
 def release_checks():
  surface.focus();page.keyboard.down('w');page.wait_for_timeout(100)
  search=section.get_by_label('Find a node');search.focus();settled();stopped=signature();page.wait_for_timeout(150);assert signature()==stopped,'Movement continued after focus left map'
  page.keyboard.up('w');page.keyboard.type('wasd');assert search.input_value()=='wasd';assert signature()==stopped,'Typing moved map';search.fill('')
  surface.focus();page.keyboard.down('d');page.wait_for_timeout(100);page.evaluate('window.dispatchEvent(new Event("blur"))');settled();stopped=signature();page.wait_for_timeout(150);assert signature()==stopped,'Movement continued after window blur';page.keyboard.up('d')
  surface.focus();page.keyboard.press('Escape');expect(surface).not_to_be_focused()
 ready()
 # A real pointer click captures keyboard focus without scrolling the page.
 surface.click(position={'x':20,'y':50});expect(surface).to_be_focused()
 for key in ['w','a','s','d','e','q']:movement(key)
 release_checks()
 section.get_by_role('button',name='Fit all connections',exact=True).click();settled()
 section.get_by_label('Map mode',exact=True).focus();section.get_by_label('Map mode',exact=True).select_option('3d');ready();expect(surface).to_be_focused()
 assert surface.get_attribute('data-backend') in ['webgpu','webgl2']
 expect(section.get_by_role('link',name='Open full EcoMap')).to_have_attribute('href','/ecosystem/network/3d?org=research-state-maryland&direction=both&depth=1')
 for navigation in ['orbit','fly']:
  section.get_by_label('Navigation',exact=True).select_option(navigation)
  for key in ['w','a','s','d','e','q']:movement(key)
  release_checks()
  section.get_by_role('button',name='Fit all connections',exact=True).click();settled()
 # Pointer orbit, scroll zoom and 3D node selection use the shared renderer.
 section.get_by_label('Navigation',exact=True).select_option('orbit')
 surface.scroll_into_view_if_needed();bounds=surface.bounding_box();before=signature()
 page.mouse.move(bounds['x']+40,bounds['y']+60);page.mouse.down();page.mouse.move(bounds['x']+140,bounds['y']+100,steps=5);page.mouse.up();settled();assert signature()!=before
 before=signature();page.mouse.wheel(0,-200);page.wait_for_timeout(200);settled();assert signature()!=before
 section.get_by_label('Navigation',exact=True).select_option('fly')
 section.get_by_label('Navigation speed',exact=True).select_option('0.25')
 section.get_by_label('Find a node').fill('Comptroller');section.locator('.organization-ecomap-search').get_by_role('button',name='Comptroller of Maryland',exact=True).click()
 comptroller=page.get_by_role('region',name='EcoMap for Comptroller of Maryland',exact=True)
 expect(comptroller.locator('canvas')).to_have_attribute('data-ready','true',timeout=90000)
 page.wait_for_function('()=>!document.querySelector(".organization-ecomap canvas")?.dataset.transitioning')
 assert '/ecosystem/organizations/source-label' in page.url
 expect(page.get_by_role('heading',name='Comptroller of Maryland',exact=True)).to_be_visible()
 expect(comptroller.get_by_label('Map mode',exact=True)).to_have_value('3d')
 expect(comptroller.get_by_label('Navigation',exact=True)).to_have_value('fly')
 expect(comptroller.get_by_label('Navigation speed',exact=True)).to_have_value('0.25')
 outgoing=page.evaluate('history.state.usr.organizationMapView')
 assert outgoing['camera']['offset']
 # Every relationship in the newly centered neighborhood is incident to its anchor.
 node_id=__import__('urllib.parse',fromlist=['unquote']).unquote(urlparse(page.url).path.split('/')[-1])
 report=ctx.request.get(base+'/api/ecosystem/organization-map',params={'org':node_id,'limit':250}).json()
 assert report['anchor']==node_id
 assert all(report['anchor'] in [edge['source'],edge['target']] for edge in report['relationships'])
 expect(comptroller.get_by_role('link',name='Open full EcoMap')).to_have_attribute('href',__import__('re').compile('direction=both&depth=1$'))
 center=comptroller.locator('.organization-ecomap-labels button.focus');bounds=comptroller.locator('canvas').bounding_box()
 assert abs(float(center.evaluate('e=>parseFloat(e.style.left)'))-bounds['width']/2)<1
 assert abs(float(center.evaluate('e=>parseFloat(e.style.top)'))-bounds['height']/2-12)<1
 comptroller.get_by_label('Find a node').fill('State of Maryland')
 comptroller.locator('.organization-ecomap-search').get_by_role('button',name='State of Maryland',exact=True).click()
 ready();expect(section.get_by_label('Map mode',exact=True)).to_have_value('3d')
 returned=page.evaluate('history.state.usr.organizationMapView')
 for a,b in zip(outgoing['camera']['offset'],returned['camera']['offset']):assert abs(a-b)<0.001,(a,b)
 assert returned['navigation']=='fly' and returned['speed']==0.25
 # Back/forward retain the neighborhood and settings.
 page.go_back();expect(comptroller.locator('canvas')).to_have_attribute('data-ready','true',timeout=90000)
 page.go_forward();ready()
 section.get_by_label('Find a node').fill('')
 section.get_by_role('button',name='Fit all connections',exact=True).click();settled()
 bounds=surface.bounding_box();before_url=page.url
 surface.click(position={'x':bounds['width']/2,'y':bounds['height']/2})
 assert page.url==before_url,'Clicking the center should not add another navigation'
 shots=[]
 for theme in ['light','dark']:
  page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
  for width in [1440,390]:
   page.set_viewport_size({'width':width,'height':1100});settled();ready()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   shot=out/f'3d-{width}-{theme}.png';section.screenshot(path=str(shot));shots.append(shot)
 # Fresh canvases are required when switching GPU and 2D contexts.
 for mode in ['2d','3d','2d']:
  section.get_by_label('Map mode',exact=True).select_option(mode);ready();movement('d')
 # Switching before async initialization completes must not resurrect old listeners.
 section.get_by_label('Map mode',exact=True).select_option('3d');section.get_by_label('Map mode',exact=True).select_option('2d');ready();movement('a')
 section.get_by_label('Find a node').fill('TEDCO');section.locator('.organization-ecomap-search').get_by_role('button',name='TEDCO',exact=True).click()
 expect(page.get_by_role('region',name='EcoMap for TEDCO').locator('canvas')).to_have_attribute('data-ready','true',timeout=60000)
 assert not errors,errors
 # A browser without usable 3D graphics gets an explicit, working 2D recovery.
 fallback=browser.new_context(ignore_https_errors=True)
 fallback.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in ['localhost','127.0.0.1','::1'] and route.request.method in ['GET','HEAD','OPTIONS'] else route.abort())
 fallback.route('**/src/features/ecosystem/webgpu-3d-renderer.js*',lambda route:route.fulfill(content_type='application/javascript',body='export async function createNetworkGPU3D(){throw new Error("3D graphics unavailable in this browser")}'))
 recovery=fallback.new_page();recovery.goto(base+'/orgs/state-of-maryland',wait_until='domcontentloaded')
 expect(recovery.locator('.organization-ecomap canvas')).to_have_attribute('data-ready','true',timeout=60000)
 recovery.get_by_label('Map mode',exact=True).select_option('3d')
 expect(recovery.get_by_role('alert')).to_contain_text('3D graphics unavailable',timeout=30000)
 recovery.get_by_role('button',name='Use 2D map',exact=True).click()
 expect(recovery.locator('.organization-ecomap canvas')).to_have_attribute('data-ready','true',timeout=30000)
 fallback.close()
 browser.close()
contact=Image.new('RGB',(1460,2200),'#e6edf0')
for index,path in enumerate(shots):
 picture=Image.open(path).convert('RGB');picture.thumbnail((700,1030));x,y=(index%2)*730+15,(index//2)*1100+35
 ImageDraw.Draw(contact).text((x,y-22),path.name,fill='black');contact.paste(picture,(x,y))
contact.save(out/'contact.png')
print('PASS: actual 3D backend; WASD/EQ in 2D, orbit and free fly; key release, canvas/window blur, typing isolation, Escape; drag/scroll/sphere selection; mode-switch cleanup; unavailable-3D recovery; organization navigation; desktop/mobile both themes')
print(out)
