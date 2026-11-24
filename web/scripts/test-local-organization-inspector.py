"""Synthetic local fullscreen inspector and complete 2D label regression."""
import pathlib, os
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from node_directory_fixture import install_node_directory_fixture
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:19458')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-inspector';out.mkdir(parents=True,exist_ok=True)
nodes=[{'id':'inspector-state','name':'State of Maryland','slug':None,'category':'state-government','financialAmount':5e9,'receivedUsd':0,'disbursedUsd':5e9},
 {'id':'inspector-agency','name':'Maryland Department of Housing and Community Development Board of Directors and Regional Community Services Administration','slug':None,'category':'state-government','financialAmount':2e9,'receivedUsd':125000000,'disbursedUsd':1875000000},
 {'id':'inspector-other','name':'Department of General Services','slug':None,'category':'general','financialAmount':None,'receivedUsd':None,'disbursedUsd':None}]
meta={'version':'inspector-fixture','generatedAt':'2026-11-23','fiscalYears':[2025,2024]}
edges=[{'id':'edge-'+n['id'],'source':nodes[0]['id'],'target':n['id'],'recordCount':7,'kinds':['transfer']} for n in nodes[1:]]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100},reduced_motion='reduce',device_scale_factor=2)
 context.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname=='localhost' and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 context.route('**/api/org/api/network/evidence-groups/public?*',lambda r:r.fulfill(json={'group':None}))
 def evidence(r):
  q=parse_qs(urlparse(r.request.url).query);node=next(n for n in nodes if n['id']==q['org'][0])
  records=[];total=0;offset=int(q.get('offset',['0'])[0]);next_offset=None
  if q.get('sort')==['amount-desc'] and node['id']!=nodes[2]['id'] and q.get('fy')!=['2024']:
   assert q.get('version')==[meta['version']]
   total=21
   records=[{'id':f'transaction-{i}','source':nodes[0]['id'],'target':nodes[1]['id'],'sourceLabel':'State of Maryland','targetLabel':'Housing and Community Development','kind':'transfer','amount':1000000-i*10000,'currency':'USD','date':'2025-06-15','financialFactType':'reported_award' if i==1 else 'disbursement','sourceUrl':'https://example.gov/transaction/'+str(i),'sourceSystem':'synthetic_ledger'} for i in range(offset,min(total,offset+20))]
   next_offset=offset+20 if offset+20<total else None
  r.fulfill(json={**meta,'fy':q.get('fy',['2025'])[0],'organization':{**node,'recordCount':0},'parents':[],'children':[],'groups':[],'records':records,'total':total,'offset':offset,'nextOffset':next_offset})
 context.route('**/api/ecosystem/organization-evidence?*',evidence);context.route('**/api/ecosystem/organization-group?*',evidence)
 def graph(r):
  q=parse_qs(urlparse(r.request.url).query);anchor=q['org'][0];links=[e for e in edges if anchor in [e['source'],e['target']]];ids={anchor}|{e[k] for e in links for k in ['source','target']};visible=[n for n in nodes if n['id'] in ids]
  r.fulfill(json={**meta,'fy':q.get('fy',['2025'])[0],'anchor':anchor,'organizations':visible,'relationships':links,'total':len(visible)-1,'incoming':0 if anchor==nodes[0]['id'] else 1,'outgoing':2 if anchor==nodes[0]['id'] else 0,'offset':0,'nextOffset':None})
 context.route('**/api/ecosystem/organization-map?*',graph)
 install_node_directory_fixture(context)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/ecosystem/organizations/inspector-state?fy=2025',wait_until='domcontentloaded')
 panel=page.locator('.organization-ecomap');canvas=panel.locator('canvas');inspector=page.get_by_role('complementary',name='Node inspector')
 def ready():
  page.wait_for_function('()=>{const c=document.querySelector(".organization-ecomap canvas");return c?.dataset.ready&&!c.dataset.layoutPending&&!c.dataset.transitioning}')
  page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
 def label(id):return panel.locator(f'.organization-ecomap-labels button[data-node-id="{id}"]')
 def full_labels():
  for placement in ['floating','surface']:
   panel.get_by_label('Title placement',exact=True).select_option(placement);ready()
   button=label(nodes[1]['id']);expect(button).to_be_visible()
   expect(button.locator('.organization-ecomap-label-name')).to_have_text(nodes[1]['name'])
   assert button.locator('.organization-ecomap-label-name').evaluate('(e)=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1')
   assert button.locator('.organization-ecomap-label-name').evaluate('(e)=>getComputedStyle(e).webkitLineClamp') in ['none','unset']
   panel.locator('.organization-ecomap-canvas').screenshot(path=str(out/f'full-name-{placement}.png'))
 ready();full_labels();expect(inspector).not_to_be_visible()
 panel.get_by_label('Node amounts',exact=True).select_option('show');ready()
 expect(label(nodes[0]['id']).locator('.organization-ecomap-label-amount')).to_have_text('Cash ↑5B')
 expect(label(nodes[1]['id']).locator('.organization-ecomap-label-amount')).to_have_text('Cash ↓125M · ↑1.9B')
 for mode in ['2d','3d']:
  panel.get_by_label('Map mode',exact=True).select_option(mode);ready()
  panel.get_by_label('Title placement',exact=True).select_option('floating');ready()
  panel.get_by_role('button',name='Fullscreen',exact=True).click();ready();expect(inspector).to_be_visible()
  expect(inspector.get_by_role('heading',name=nodes[0]['name'],exact=True)).to_be_visible()
  label(nodes[1]['id']).hover();expect(inspector.get_by_role('heading',name=nodes[1]['name'],exact=True)).to_be_visible()
  expect(inspector.get_by_text('$125,000,000.00',exact=True)).to_be_visible()
  area=canvas.bounding_box();page.mouse.move(area['x']+area['width']+5,area['y']+40,steps=10)
  expect(inspector.get_by_role('heading',name=nodes[1]['name'],exact=True)).to_be_visible()
  inspector.get_by_role('button',name='Keep details',exact=True).click()
  expect(inspector.get_by_text('Selected node',exact=True)).to_be_visible()
  transactions=inspector.get_by_role('region',name='Individual recorded transactions')
  expect(transactions.get_by_text('1–20 of 21 records',exact=True)).to_be_visible()
  bubbles=transactions.locator('.organization-transaction-bubble')
  expect(bubbles.first).to_have_attribute('data-record-id','transaction-0')
  expect(bubbles.first).to_contain_text('USD 1,000,000.00')
  expect(bubbles.first).to_have_attribute('data-direction','received')
  expect(transactions.get_by_text('Award / approval · not a payment',exact=True)).to_be_visible()
  expect(transactions.get_by_role('link',name='Source evidence ↗').first).to_have_attribute('href','https://example.gov/transaction/0')
  transactions.get_by_role('button',name='Next records',exact=True).click()
  expect(transactions.get_by_text('21–21 of 21 records',exact=True)).to_be_visible()
  expect(transactions.get_by_role('button',name='Next records',exact=True)).to_be_disabled()
  transactions.get_by_role('button',name='Previous',exact=True).click()
  expect(transactions.get_by_text('1–20 of 21 records',exact=True)).to_be_visible()
  inspector.evaluate('(e)=>e.scrollTop=210')
  for theme in ['dark','light']:
   page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
   panel.screenshot(path=str(out/f'transactions-{mode}-{theme}.png'))
  if mode=='3d':
   panel.get_by_label('Title placement',exact=True).select_option('surface');ready()
   panel.screenshot(path=str(out/'transactions-3d-on-spheres.png'))
   panel.get_by_label('Title placement',exact=True).select_option('floating');ready()
  page.set_viewport_size({'width':390,'height':1000});ready()
  inspector.evaluate('(e)=>e.scrollTop=340')
  panel.screenshot(path=str(out/f'transactions-{mode}-mobile.png'))
  assert inspector.locator('.organization-transaction-bubbles').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
  page.set_viewport_size({'width':1400,'height':1100});ready()
  inspector.evaluate('(e)=>e.scrollTop=0')
  # Pointer picking of a circle/sphere also updates details without navigation.
  box=canvas.bounding_box()
  if mode=='2d':point={'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}
  else:
   lb=label(nodes[0]['id']).bounding_box();point={'x':lb['x']+lb['width']/2,'y':lb['y']-12}
  if mode=='3d':panel.get_by_label('Title placement',exact=True).select_option('surface');ready()
  page.mouse.move(point['x'],point['y']);expect(inspector.get_by_role('heading',name=nodes[0]['name'],exact=True)).to_be_visible()
  page.mouse.move(box['x']+5,box['y']+5);expect(inspector.get_by_role('heading',name=nodes[1]['name'],exact=True)).to_be_visible()
  inspector.get_by_role('button',name='Close selected node details').click();expect(inspector.get_by_text('Hover a node to inspect it, or select a node in the map.')).to_be_visible()
  # Keyboard users can inspect and pin a focused label too.
  panel.get_by_label('Title placement',exact=True).select_option('floating');ready()
  label(nodes[2]['id']).focus();expect(inspector.get_by_role('heading',name=nodes[2]['name'],exact=True)).to_be_visible()
  expect(inspector.get_by_text('Unavailable',exact=True)).to_have_count(3)
  inspector.get_by_role('button',name='Keep details').click()
  for theme in ['light','dark']:
   page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
   panel.screenshot(path=str(out/f'desktop-{mode}-{theme}.png'))
  inspector.get_by_role('button',name='Minimize node inspector').click();expect(inspector).not_to_be_visible()
  panel.get_by_role('button',name='Show node inspector').click();expect(inspector).to_be_visible()
  expect(inspector.get_by_role('heading',name=nodes[2]['name'],exact=True)).to_be_visible()
  page.set_viewport_size({'width':390,'height':1000});ready();panel.screenshot(path=str(out/f'mobile-{mode}.png'))
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  inspector.get_by_role('button',name='Minimize node inspector').click();ready();panel.screenshot(path=str(out/f'mobile-{mode}-minimized.png'))
  assert canvas.bounding_box()['width']>=330
  panel.get_by_role('button',name='Show node inspector').click()
  page.set_viewport_size({'width':1400,'height':1100});ready()
  # Navigation must preserve the same canvas and fullscreen while replacing details.
  page.evaluate('window.inspectorCanvas=document.querySelector(".organization-ecomap canvas")')
  for node in [nodes[1],nodes[0]]:
   panel.get_by_label('Find a node',exact=True).fill(node['name'])
   panel.locator('.organization-ecomap-search').get_by_role('button',name=node['name'],exact=True).click()
   expect(canvas).to_have_attribute('data-anchor',node['id']);ready()
   expect(inspector.get_by_role('heading',name=node['name'],exact=True)).to_be_visible()
   expect(inspector.get_by_text('Selected node',exact=True)).to_be_visible()
   assert page.evaluate('window.inspectorCanvas===document.querySelector(".organization-ecomap canvas")')
   expect(panel.get_by_role('button',name='Exit fullscreen',exact=True)).to_be_visible()
   if node['id']==nodes[0]['id']:
    expect(inspector.locator('.organization-transaction-bubble').first).to_have_attribute('data-direction','disbursed')
  panel.get_by_label('Fiscal year',exact=True).select_option('2024');expect(inspector.get_by_text('FY2024',exact=True)).to_be_visible();ready()
  expect(inspector.get_by_text('No financial transactions recorded for this year.',exact=True)).to_be_visible()
  panel.get_by_label('Fiscal year',exact=True).select_option('2025');ready()
  assert page.evaluate("()=>{const c=document.querySelector('.organization-ecomap canvas'),r=c.getBoundingClientRect();return Math.abs(c.width-r.width*devicePixelRatio)<=2&&Math.abs(c.height-r.height*devicePixelRatio)<=2}")
  page.keyboard.press('Escape');expect(inspector).not_to_be_visible()
 assert not errors,errors
 browser.close()
print('PASS: cash labels in both directions; individual transaction bubbles, source links, award badges and pagination; full 2D names in both placements; fullscreen inspector hover/pin/close/minimize/restore; 2D/3D pointer picking; keyboard access; navigation/year continuity; native resolution; desktop/mobile light/dark; no browser errors.')
