"""Global node search, off-map universities, pagination and navigation continuity."""
import pathlib
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from node_directory_fixture import install_node_directory_fixture
base='https://localhost:8443'
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-node-search';out.mkdir(parents=True,exist_ok=True)
root={'id':'search-root','name':'State Example','slug':None,'category':'state-government','financialAmount':1e9}
universities=[{'id':f'university-{i}','name':f'University of Example {i:02d}','slug':None,'category':'university','type':'University','financialAmount':1e6} for i in range(31)]
universities += [{'id':'campus','name':'Alpha Research Campus','type':'University','slug':None,'category':'university'}, {'id':'retry','name':'Retry University','type':'University','slug':None,'category':'university'}]
duplicates=[
 {'id':'source-label:maryland_comptroller:recipient:college', 'name':'COLLEGE OF EXAMPLE DOWNTOWN', 'type':'Source label'},
 {'id':'source-label:nonprofit_grant:recipient:college', 'name':'COLLEGE OF EXAMPLE DOWNTOWN', 'type':'Source label'},
 {'id':'usgov:recipient:COLLEGE01', 'name':'COLLEGE OF EXAMPLE DOWNTOWN', 'type':'Organization'},
 {'id':'source-label:maryland_comptroller:agency:county', 'name':'College of Example Downtown County', 'type':'Source label'},
 {'id':'usgov:recipient:COUNTY01', 'name':'COLLEGE OF EXAMPLE DOWNTOWN COUNTY', 'type':'Grant recipient'},
 {'id':'usgov:recipient:COUNTY02', 'name':'COLLEGE OF EXAMPLE DOWNTOWN COUNTY', 'type':'Organization'},
 {'id':'source-label:maryland_comptroller:recipient:foundation', 'name':'COLLEGE OF EXAMPLE DOWNTOWN FOUNDATION', 'type':'Source label'},
 {'id':'nonprofit:123456789', 'name':'COLLEGE OF EXAMPLE DOWNTOWN FOUNDATION INC', 'type':'Nonprofit organization'},
 {'id':'source-label:nonprofit_grant:recipient:foundation', 'name':'COLLEGE OF EXAMPLE DOWNTOWN FOUNDATION INC', 'type':'Source label'},
]
nodes=[{'category':'general','slug':None,**n} for n in [root,*universities,*duplicates]];by_id={n['id']:n for n in nodes};meta={'version':'search-fixture','generatedAt':'2026-11-23','fiscalYears':[2025,2024]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100},reduced_motion='reduce',device_scale_factor=2)
 context.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname=='localhost' and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 context.route('**/api/org/api/network/evidence-groups/public?*',lambda r:r.fulfill(json={'group':None}))
 def evidence(r):
  q=parse_qs(urlparse(r.request.url).query);n=by_id[q['org'][0]]
  r.fulfill(json={**meta,'fy':q.get('fy',['2025'])[0],'organization':{**n,'recordCount':0},'parents':[],'children':[],'groups':[],'records':[],'total':0,'offset':0,'nextOffset':None})
 context.route('**/api/ecosystem/organization-evidence?*',evidence);context.route('**/api/ecosystem/organization-group?*',evidence)
 def graph(r):
  q=parse_qs(urlparse(r.request.url).query);anchor=q['org'][0]
  # Every university is disconnected from the starting map.
  r.fulfill(json={**meta,'fy':q.get('fy',['2025'])[0],'parentDepth':int(q.get('parentDepth',['1'])[0]),'childDepth':int(q.get('childDepth',['1'])[0]),'anchor':anchor,'organizations':[by_id[anchor]],'relationships':[],'total':0,'incoming':0,'outgoing':0,'offset':0,'nextOffset':None})
 context.route('**/api/ecosystem/organization-map?*',graph)
 install_node_directory_fixture(context,nodes)
 failures={'remaining':1}
 def flaky(r):
  if parse_qs(urlparse(r.request.url).query).get('q')==['retry'] and failures['remaining']:
   failures['remaining']-=1;r.fulfill(status=503,json={'error':'Search temporarily unavailable'})
  else:r.fallback()
 context.route('**/api/ecosystem/organizations?*',flaky)
 page=context.new_page();errors=[];queries=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:queries.append(parse_qs(urlparse(r.url).query)) if urlparse(r.url).path=='/api/ecosystem/organizations' else None)
 page.goto(base+'/ecosystem/organizations/search-root?fy=2025&parentDepth=2&childDepth=3',wait_until='domcontentloaded')
 panel=page.locator('.organization-ecomap');field=panel.get_by_label('Find a node',exact=True);results=panel.get_by_label('All node search results');canvas=panel.locator('canvas')
 def ready():page.wait_for_function('()=>{const c=document.querySelector(".organization-ecomap canvas");return c?.dataset.ready&&!c.dataset.layoutPending&&!c.dataset.transitioning}')
 ready();assert len(queries)==0
 for mode in ['2d','3d']:
  panel.get_by_label('Map mode',exact=True).select_option(mode);ready()
  panel.get_by_label('Color by',exact=True).select_option('volume')
  panel.get_by_role('button',name='Fullscreen',exact=True).click()
  expect(panel.get_by_role('button',name='Exit fullscreen',exact=True)).to_be_visible()
  page.evaluate('window.searchCanvas=document.querySelector(".organization-ecomap canvas")')
  field.fill('UNIVERSITY');expect(results.get_by_role('status')).to_contain_text('33 matching names')
  expect(results.get_by_role('button',name='Alpha Research Campus',exact=True)).to_be_visible()
  expect(results.get_by_role('button',name='University of Example 30',exact=True)).not_to_be_visible()
  results.get_by_role('button',name='Next results',exact=True).click()
  expect(results.get_by_role('status')).to_contain_text('21–33')
  target=results.get_by_role('button',name='University of Example 30',exact=True);expect(target).to_be_visible()
  results.get_by_role('button',name='Previous results',exact=True).click();expect(results.get_by_role('status')).to_contain_text('1–20')
  results.get_by_role('button',name='Next results',exact=True).click();expect(results.get_by_role('status')).to_contain_text('21–33')
  panel.screenshot(path=str(out/f'{mode}-global-results.png'))
  target.click();expect(canvas).to_have_attribute('data-anchor','university-30');ready()
  assert page.evaluate('window.searchCanvas===document.querySelector(".organization-ecomap canvas")')
  expect(panel.get_by_label('Color by',exact=True)).to_have_value('volume')
  expect(panel.get_by_label('Fiscal year',exact=True)).to_have_value('2025')
  expect(panel.get_by_label('Parent levels',exact=True)).to_have_value('2');expect(panel.get_by_label('Child levels',exact=True)).to_have_value('3')
  expect(panel.get_by_role('button',name='Exit fullscreen',exact=True)).to_be_visible()
  expect(page.get_by_role('complementary',name='Node inspector').get_by_role('heading',name='University of Example 30')).to_be_visible()
  field.fill('State Example');results.get_by_role('button',name='State Example',exact=True).click();expect(canvas).to_have_attribute('data-anchor','search-root');ready()
  page.keyboard.press('Escape')
 field.fill('retry');expect(results.get_by_role('alert')).to_contain_text('Search temporarily unavailable')
 expect(results).not_to_contain_text('No matching nodes')
 results.get_by_role('button',name='Retry node search').click();expect(results.get_by_role('button',name='Retry University',exact=True)).to_be_visible()
 field.fill('zz-no-such-node');expect(results.get_by_role('status')).to_have_text('No matching nodes in the full directory.')
 field.fill('university');expect(results.get_by_role('status')).to_contain_text('1–20')
 page.set_viewport_size({'width':390,'height':1000});results.get_by_role('button',name='Next results').click();expect(results.get_by_role('status')).to_contain_text('21–33');panel.screenshot(path=str(out/'mobile-results.png'))
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 field.fill('college');expect(results.get_by_role('status')).to_contain_text('4 matching names')
 expect(results.get_by_role('status')).to_contain_text('9 source nodes')
 groups=results.locator('details');expect(groups).to_have_count(3)
 results.evaluate('(el)=>el.scrollTop=0');panel.screenshot(path=str(out/'mobile-grouped-collapsed.png'))
 for summary in groups.locator('summary').all(): summary.click()
 expect(results.get_by_role('button')).to_have_count(9)
 assert all(n['id'] in results.inner_text() for n in duplicates if ' FOUNDATION' not in n['name'] or n['name'].endswith(' INC'))
 results.evaluate('(el)=>el.scrollTop=0');panel.screenshot(path=str(out/'mobile-grouped-results.png'))
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.set_viewport_size({'width':1400,'height':1100})
 for summary in groups.locator('summary').all(): summary.click()
 results.evaluate('(el)=>el.scrollTop=0');panel.get_by_role('button',name='Fullscreen',exact=True).click()
 panel.screenshot(path=str(out/'desktop-grouped-collapsed.png'))
 groups.first.locator('summary').click();results.evaluate('(el)=>el.scrollTop=0');panel.screenshot(path=str(out/'desktop-grouped-results.png'))
 groups.nth(1).locator('summary').click()
 target=results.get_by_role('button',name='COLLEGE OF EXAMPLE DOWNTOWN COUNTY · USAspending · Recipient COUNTY02 · usgov:recipient:COUNTY02',exact=True)
 target.click();expect(canvas).to_have_attribute('data-anchor','usgov:recipient:COUNTY02');ready()
 expect(panel.get_by_label('Color by',exact=True)).to_have_value('volume')
 field.fill('');expect(results).not_to_be_visible()
 assert all('org' not in q and 'fy' not in q and q.get('limit')==['20'] and q.get('group')==['name'] for q in queries),queries
 assert any(q.get('offset')==['20'] and q.get('version')==['node-directory-fixture'] for q in queries),queries
 assert not errors,errors
 browser.close()
print('PASS: full-directory universities outside the map, type search, pagination, error/retry/empty states, 2D/3D fullscreen and settings continuity, responsive grouped results, source-specific navigation, bounded requests.')
