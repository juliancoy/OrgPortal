"""Read-only local fullscreen toggle, Escape, fallback and renderer continuity."""
import json,os,pathlib
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-map-fullscreen';out.mkdir(parents=True,exist_ok=True)
url=base+'/ecosystem/organizations/source-label%3Amaryland_comptroller%3Arecipient%3Af8dbfbd61469d93b31a7a5326542625d'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for fallback in [False,True]:
  ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1000})
  ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ['localhost','127.0.0.1','::1'] and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
  if fallback:ctx.add_init_script('Element.prototype.requestFullscreen=()=>Promise.reject(new Error("Fullscreen denied for test"))')
  page=ctx.new_page();errors=[];requests=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:requests.append(r.url) if '/api/ecosystem/organization-map?' in r.url else None)
  page.goto(url,wait_until='domcontentloaded')
  area=page.locator('.organization-ecomap-stage');panel=page.locator('.organization-ecomap')
  def ready():page.locator('.organization-ecomap canvas[data-ready="true"]').wait_for(timeout=60000)
  ready()
  for mode in ['2d','3d']:
   page.get_by_label('Map mode',exact=True).select_option(mode);ready()
   expect(area.get_by_role('button',name='Fullscreen',exact=True)).to_have_count(1)
   original=area.bounding_box();request_count=len(requests)
   page.evaluate('window.originalCanvas=document.querySelector(".organization-ecomap canvas")')
   area.get_by_role('button',name='Fullscreen',exact=True).click()
   exit_button=area.get_by_role('button',name='Exit fullscreen',exact=True)
   expect(exit_button).to_have_attribute('aria-pressed','true')
   page.wait_for_function('()=>{const r=document.querySelector(".organization-ecomap").getBoundingClientRect();return r.x===0&&r.y===0&&Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2}')
   assert page.evaluate('Boolean(document.fullscreenElement)')!=fallback
   for label in ['Fiscal year','Map mode','Color by','Title placement','Navigation speed','Find a node']:
    expect(panel.get_by_label(label,exact=True)).to_be_visible()
   if mode=='3d':expect(panel.get_by_label('Navigation',exact=True)).to_be_visible()
   panel.get_by_label('Color by',exact=True).select_option('volume')
   panel.get_by_label('Navigation speed',exact=True).select_option('3')
   expect(panel.get_by_label('Color by',exact=True)).to_have_value('volume')
   expect(panel.get_by_label('Navigation speed',exact=True)).to_have_value('3')
   funds=panel.get_by_role('region',name='Map financial totals',exact=True)
   expect(funds).to_contain_text('FY2025')
   expected=ctx.request.get(base+'/api/ecosystem/organization-evidence?org=source-label%3Amaryland_comptroller%3Arecipient%3Af8dbfbd61469d93b31a7a5326542625d&fy=2025&limit=1').json()['financialTotals']
   for row in expected['currencies']:
    for direction in ['received','disbursed']:
     formatted=page.evaluate('(r)=>new Intl.NumberFormat(undefined,{style:"currency",currency:r.currency,currencyDisplay:"code",minimumFractionDigits:2,maximumFractionDigits:2}).format(r.value)',{'currency':row['currency'],'value':row[direction]})
     expect(funds.locator('[data-direction="'+direction+'"]')).to_contain_text(formatted)

   page.locator('.organization-ecomap canvas').focus();page.keyboard.down('d');page.wait_for_timeout(100);page.keyboard.up('d')
   assert page.evaluate('originalCanvas===document.querySelector(".organization-ecomap canvas")')
   panel.screenshot(path=str(out/(f'{mode}-'+('fallback' if fallback else 'native')+'.png')))
   page.keyboard.press('Escape')
   expect(area.get_by_role('button',name='Fullscreen',exact=True)).to_have_attribute('aria-pressed','false')
   page.wait_for_function('(h)=>Math.abs(document.querySelector(".organization-ecomap-stage").getBoundingClientRect().height-h)<2',arg=original['height'])
   assert not page.evaluate('Boolean(document.fullscreenElement)')
   # The same square also exits; keyboard activation remains available.
   button=area.get_by_role('button',name='Fullscreen',exact=True);button.focus();page.keyboard.press('Enter')
   area.get_by_role('button',name='Exit fullscreen',exact=True).click()
   expect(button).to_have_attribute('aria-pressed','false')
   assert page.evaluate('originalCanvas===document.querySelector(".organization-ecomap canvas")')
   assert len(requests)==request_count,'Fullscreen refetched graph data'
  # Changing the fiscal year keeps the fullscreen host and refreshes both bubbles.
  area.get_by_role('button',name='Fullscreen',exact=True).click()
  panel.get_by_label('Title placement',exact=True).select_option('surface')
  panel.get_by_label('Navigation',exact=True).select_option('fly')
  for fy in ['all','2024','2025']:

   panel.get_by_label('Fiscal year',exact=True).select_option(fy)
   expect(panel.get_by_role('region',name='Map financial totals',exact=True)).to_contain_text('All years' if fy=='all' else 'FY'+fy)
   ready();expect(panel.get_by_role('button',name='Exit fullscreen',exact=True)).to_have_count(1)
   assert page.evaluate('document.querySelector(".organization-ecomap").classList.contains("eco-fullscreen")')
   for label,value in [('Color by','volume'),('Title placement','surface'),('Navigation','fly'),('Navigation speed','3'),('Map mode','3d')]:
    expect(panel.get_by_label(label,exact=True)).to_have_value(value)
   assert page.evaluate('originalCanvas===document.querySelector(".organization-ecomap canvas")'),'Year changed the renderer'

  panel.get_by_label('Title placement',exact=True).select_option('floating')
  # A year change must not recenter a camera that the user moved.
  page.wait_for_function('!document.querySelector(".organization-ecomap canvas").dataset.transitioning')
  anchor=panel.locator('.organization-ecomap-labels button').filter(has_text='MVS INC')
  expect(anchor).to_be_visible()
  start=anchor.evaluate('(e)=>e.style.left')
  page.locator('.organization-ecomap canvas').focus();page.keyboard.down('d')
  # Surface-title shaders may still compile; await the actual pan paint.
  page.wait_for_function('(left)=>[...document.querySelectorAll(".organization-ecomap-labels button")].some(e=>e.textContent==="MVS INC"&&e.style.left!==left)',arg=start)
  page.keyboard.up('d')
  anchor.screenshot() # Wait for the projected label to settle before comparing.
  before=anchor.evaluate('(e)=>{const c=e.closest(".organization-ecomap-canvas");return {left:e.style.left,top:e.style.top,width:c.clientWidth,height:c.clientHeight}}')
  panel.get_by_label('Fiscal year',exact=True).select_option('all')
  expect(panel.get_by_role('region',name='Map financial totals',exact=True)).to_contain_text('All years');ready()
  page.wait_for_function('!document.querySelector(".organization-ecomap canvas").dataset.transitioning')
  after=anchor.evaluate('(e)=>{const c=e.closest(".organization-ecomap-canvas");return {left:e.style.left,top:e.style.top,width:c.clientWidth,height:c.clientHeight}}')
  assert after==before,('Year change recentered the camera',before,after)
  page.set_viewport_size({'width':390,'height':844})
  panel.screenshot(path=str(out/f'fullscreen-mobile-{fallback}.png'))
  assert page.evaluate('document.querySelector(".organization-ecomap").scrollWidth<=innerWidth')
  graph=panel.locator('.organization-ecomap-canvas').bounding_box();bubbles=panel.locator('.organization-map-funds').bounding_box()
  assert bubbles['y']>=graph['y']+graph['height']-1,'Mobile bubbles overlap the graph'
  panel.get_by_role('button',name='Exit fullscreen',exact=True).click()
  area.screenshot(path=str(out/f'inline-mobile-{fallback}.png'))
  box=area.bounding_box();button=area.get_by_role('button',name='Fullscreen',exact=True).bounding_box()
  assert 0<=box['x']+box['width']-button['x']-button['width']<=16
  assert 0<=box['y']+box['height']-button['y']-button['height']<=16
  assert not errors,errors
  ctx.close()
 browser.close()
print('PASS: 2D/3D native fullscreen and denied-API fallback; Escape, button exit and keyboard activation; same canvas and no refetch on expansion; fullscreen settings, year changes and evidence-matched total bubbles; mobile placement')
print(out)
