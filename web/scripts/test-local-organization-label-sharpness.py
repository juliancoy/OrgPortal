"""Read-only synthetic check: exclusive surface/floating labels at every zoom."""
import json, math, os, pathlib
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
from node_directory_fixture import install_node_directory_fixture
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-label-sharpness'/os.environ.get('CAPTURE_STAGE','after')
out.mkdir(parents=True,exist_ok=True)
nodes=[{'id':id,'name':name,'slug':None,'category':category,'financialAmount':amount} for id,name,category,amount in [
 ('title-state','State of Maryland','state-government',1e10),('title-health','Maryland Department of Health','health',4e9),
 ('title-umd','University of Maryland','university',2e9),('title-small','Small recipient','company',1e5),('title-unknown','Undisclosed recipient','general',None)]]
for node,received in zip(nodes,[5e9,1.25e6,0,-2500,None]):node.update(receivedUsd=received,disbursedUsd=0 if received is not None else None)
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
  params=parse_qs(urlparse(route.request.url).query);fy=params.get('fy',['2025'])[0]
  anchor=params['org'][0];links=[e for e in edges if anchor in [e['source'],e['target']]]
  ids={anchor}|{e[k] for e in links for k in ['source','target']}
  visible=[{**n,'receivedUsd':n['receivedUsd']/2 if fy=='2024' and n['receivedUsd'] is not None else n['receivedUsd']} for n in nodes if n['id'] in ids]
  route.fulfill(json={'version':'titles-fixture','generatedAt':'2026-11-22','fy':fy,'fiscalYears':[2024,2025],'anchor':anchor,'organizations':visible,
   'relationships':links,'total':len(ids)-1,'incoming':sum(e['target']==anchor for e in links),'outgoing':sum(e['source']==anchor for e in links),'offset':0,'nextOffset':None})
 ctx.route('**/api/ecosystem/organization-map?*',neighborhood)
 ctx.add_init_script("""window.paintedTitles=[];const fill=CanvasRenderingContext2D.prototype.fillText;
 CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){window.paintedTitles.push({text,color:this.fillStyle});if(window.paintedTitles.length>1000)window.paintedTitles.shift();return fill.call(this,text,x,y,...args)};""")
 install_node_directory_fixture(ctx)
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/ecosystem/organizations/title-state',wait_until='domcontentloaded')
 panel=page.locator('.organization-ecomap');canvas=panel.locator('canvas')
 panel.locator('canvas[data-ready="true"]').wait_for(timeout=20000)
 page.get_by_label('Title placement',exact=True).select_option('surface')
 def frames():page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
 for width,name in [(1400,'desktop'),(390,'mobile')]:
  page.set_viewport_size({'width':width,'height':1100});frames()
  for mode in ['2d','3d']:
   page.get_by_label('Map mode',exact=True).select_option(mode)
   panel.locator(f'canvas[data-ready="true"][data-mode="{mode}"]').wait_for(timeout=20000)
   page.get_by_role('button',name='Fit all connections',exact=True).click();frames()
   expect(page.get_by_label('Title placement',exact=True).locator('option:checked')).to_have_text('On circles' if mode=='2d' else 'On spheres')
   for zoom in ['overview','far','near']:
    for _ in range({'overview':0,'far':2,'near':3}[zoom]):
     page.get_by_role('button',name='Zoom in on organization map',exact=True).click();frames()
    for theme in ['light','dark']:
     page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme);frames()
     panel.locator('.organization-ecomap-canvas').screenshot(path=str(out/f'{name}-{mode}-{zoom}-{theme}.png'))
     if mode=='2d' and zoom=='overview':panel.screenshot(path=str(out/f'{name}-2d-panel-{theme}.png'))
    if mode=='3d' and zoom=='far':
     print(name,'far sphere titles:',canvas.get_attribute('data-sphere-titles'),flush=True)
     if os.environ.get('CAPTURE_STAGE')!='before':assert int(canvas.get_attribute('data-sphere-titles'))>=2
    if os.environ.get('CAPTURE_STAGE')!='before':
     if mode=='3d':
      assert panel.locator('.organization-ecomap-labels button:visible').count()==0
     else:
      assert panel.locator('.organization-ecomap-labels button:visible:not(.on-circle)').count()==0
     if zoom=='overview' and mode=='2d':
      assert panel.locator('.organization-ecomap-labels button:visible').count()>0
      assert panel.locator('.organization-ecomap-labels button:visible').count()<=45
      assert panel.locator('.organization-ecomap-labels button:visible').first.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=12
      if mode=='2d':
       centered=panel.locator('.organization-ecomap-labels button.on-circle[data-node-id="title-state"]')
       expect(centered).to_be_visible()
       metrics=centered.evaluate("""e=>{const b=e.getBoundingClientRect(),c=document.querySelector('.organization-ecomap canvas'),r=c.getBoundingClientRect(),t=c.getContext('2d').getTransform(),s=getComputedStyle(e);return {dx:b.x+b.width/2-r.x-t.e/(c.width/r.width),dy:b.y+b.height/2-r.y-t.f/(c.height/r.height),background:s.backgroundColor}}""")
       assert abs(metrics['dx'])<2 and abs(metrics['dy'])<2,metrics
       assert metrics['background']=='rgba(0, 0, 0, 0)',metrics
       page.get_by_label('Title placement',exact=True).select_option('floating');frames()
       assert panel.locator('.organization-ecomap-labels button.on-circle:visible').count()==0
       page.get_by_label('Title placement',exact=True).select_option('surface');frames()

     if zoom=='near':
      if mode=='3d':assert int(canvas.get_attribute('data-sphere-titles'))>0
      else:expect(panel.locator('.organization-ecomap-labels button.on-circle[data-node-id="title-state"]')).to_be_visible()
     # Reusing pooled buttons must not leave either representation behind.
     page.get_by_label('Title placement',exact=True).select_option('floating');frames()
     assert canvas.get_attribute('data-sphere-titles')=='0'
     assert panel.locator('.organization-ecomap-labels button:visible').count()>0
     assert panel.locator('.organization-ecomap-labels button.on-circle:visible').count()==0
     page.get_by_label('Title placement',exact=True).select_option('surface');frames()
     if mode=='3d':assert panel.locator('.organization-ecomap-labels button:visible').count()==0
     else:assert panel.locator('.organization-ecomap-labels button:visible:not(.on-circle)').count()==0
 if os.environ.get('CAPTURE_STAGE')!='before':
  page.get_by_role('button',name='Fit all connections',exact=True).click();frames()
  page.get_by_label('Find a node',exact=True).fill('Maryland Department of Health')
  page.locator('.organization-ecomap-search').get_by_role('button',name='Maryland Department of Health',exact=True).click()
  target_id='title-health'
  panel.locator(f'canvas[data-ready="true"][data-mode="3d"][data-anchor="{target_id}"]').wait_for(timeout=20000)
  expect(panel.get_by_label('Title placement',exact=True)).to_have_value('surface')
  frames()
  assert panel.locator('.organization-ecomap-labels button:visible').count()==0
  # The optional second line distinguishes receipts from disbursements and combined volume.
  page.goto(base+'/ecosystem/organizations/title-state?fy=2025',wait_until='domcontentloaded')
  panel.locator('canvas[data-ready="true"]').wait_for(timeout=20000)
  expect(page.get_by_label('Cash flow amounts',exact=True)).to_have_value('hide')
  page.get_by_label('Cash flow amounts',exact=True).select_option('show');frames()
  for width,name in [(1400,'desktop'),(390,'mobile')]:
   page.set_viewport_size({'width':width,'height':1100})
   for mode in ['2d','3d']:
    page.get_by_label('Map mode',exact=True).select_option(mode)
    panel.locator(f'canvas[data-ready="true"][data-mode="{mode}"]').wait_for(timeout=20000)
    page.get_by_role('button',name='Fit all connections',exact=True).click();frames()
    page.get_by_label('Title placement',exact=True).select_option('floating');frames()
    root=panel.locator('.organization-ecomap-labels button[data-node-id="title-state"]')
    expect(root.locator('.organization-ecomap-label-amount')).to_have_text('↓5B')
    geometry=root.evaluate("""e=>{const n=e.querySelector('.organization-ecomap-label-name'),a=e.querySelector('.organization-ecomap-label-amount');return {below:a.getBoundingClientRect().top>=n.getBoundingClientRect().bottom,name:getComputedStyle(n).color,amount:getComputedStyle(a).color}}""")
    assert geometry['below'] and geometry['name']!=geometry['amount'],geometry
    for theme in ['light','dark']:
     page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme);frames()
     panel.screenshot(path=str(out/f'{name}-{mode}-received-floating-{theme}.png'))
    page.evaluate('window.paintedTitles=[]')
    page.get_by_label('Title placement',exact=True).select_option('surface');frames()
    for _ in range(5):page.get_by_role('button',name='Zoom in on organization map',exact=True).click();frames()
    if mode=='3d':
     page.wait_for_function('paintedTitles.some(row=>row.text==="↓5B"&&row.color==="#ffd166")')
     assert int(canvas.get_attribute('data-sphere-titles'))>0
    else:expect(root.locator('.organization-ecomap-label-amount')).to_have_text('↓5B')
    if mode=='3d':assert panel.locator('.organization-ecomap-labels button:visible').count()==0
    for theme in ['light','dark']:
     page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme);frames()
     panel.locator('.organization-ecomap-canvas').screenshot(path=str(out/f'{name}-{mode}-received-surface-{theme}.png'))
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  # New amounts repaint the same sphere texture while preferences stay selected.
  page.get_by_label('Color by',exact=True).select_option('volume')
  page.evaluate('window.paintedTitles=[]')
  page.get_by_label('Fiscal year',exact=True).select_option('2024')
  page.wait_for_function('paintedTitles.some(row=>row.text==="↓2.5B"&&row.color==="#ffd166")')
  expect(page.get_by_label('Cash flow amounts',exact=True)).to_have_value('show')
  expect(page.get_by_label('Color by',exact=True)).to_have_value('volume')
  page.get_by_role('button',name='Fullscreen',exact=True).click()
  expect(page.get_by_label('Cash flow amounts',exact=True)).to_be_visible()
  page.get_by_label('Cash flow amounts',exact=True).select_option('hide');frames()
  page.get_by_role('button',name='Exit fullscreen',exact=True).click()
  page.get_by_label('Title placement',exact=True).select_option('floating');frames()
  assert panel.locator('.organization-ecomap-label-amount:visible').count()==0
  page.get_by_label('Cash flow amounts',exact=True).select_option('show');frames()
  page.get_by_label('Find a node',exact=True).fill('Maryland Department of Health')
  page.locator('.organization-ecomap-search').get_by_role('button',name='Maryland Department of Health',exact=True).click()
  panel.locator('canvas[data-ready="true"][data-anchor="title-health"]').wait_for(timeout=20000)
  expect(page.get_by_label('Cash flow amounts',exact=True)).to_have_value('show')
  page.reload(wait_until='domcontentloaded')
  panel.locator('canvas[data-ready="true"]').wait_for(timeout=20000)
  expect(page.get_by_label('Cash flow amounts',exact=True)).to_have_value('show')
  # A new preference must beat an older value stored in this navigation entry.
  page.get_by_label('Cash flow amounts',exact=True).select_option('hide')
  page.reload(wait_until='domcontentloaded')
  panel.locator('canvas[data-ready="true"]').wait_for(timeout=20000)
  expect(page.get_by_label('Cash flow amounts',exact=True)).to_have_value('hide')
 assert not errors,errors
 browser.close()
print('Captured distant and close surface titles in 2D/3D, desktop/mobile, light/dark:',out)
