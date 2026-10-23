#!/usr/bin/env python3
"""Unified organization home with real local accounts, settings and hosted events."""
import secrets,uuid
from datetime import datetime,timedelta,timezone
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from local_browser_test_support import BASE,preflight,verification_link
preflight();run=uuid.uuid4().hex[:10]
def good(response):
 assert response.ok,f'{response.status}: {response.text()[:200]}'
 return response.json() if 'application/json' in response.headers.get('content-type','') else {}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 def context():
  ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1280,'height':1000})
  ctx.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in {'localhost','127.0.0.1'} else route.abort())
  return ctx
 owner=context();assert good(owner.request.get(BASE+'/api/org/api/network/replication/status'))['mode']=='primary'
 email=f'unified-{run}@example.com';password=secrets.token_urlsafe(32)
 good(owner.request.post(BASE+'/pidp/auth/register',data={'email':email,'password':password,'full_name':f'Dummy Unified Owner {run}'}))
 assert owner.request.get(verification_link(email),max_redirects=0).status==303
 good(owner.request.post(BASE+'/pidp/auth/session/login',form={'username':email,'password':password},headers={'Origin':BASE}))
 auth={'Authorization':'Bearer '+good(owner.request.get(BASE+'/pidp/auth/session-token'))['access_token']}
 good(owner.request.get(BASE+'/api/org/api/accounts/me',headers=auth))
 def create(label):return good(owner.request.post(BASE+'/api/org/api/network/orgs',headers=auth,data={'name':f'Dummy {label} Unified {run}','description':f'Shared {label} organization description.','image_url':'/images/org-placeholder.svg','city':'Baltimore','kind':'organization','acknowledgeOwnership':True}))
 a,b=create('Alpha'),create('Beta');alias='different-site-'+run
 heading='Welcome to '+a['name'];copy='Additional homepage details '+run
 setup=good(owner.request.put(BASE+'/api/org/api/network/orgs/'+a['id']+'/portal',headers=auth,data={
  'slug':alias,'name':a['name'],'tagline':'Built together '+run,'home_heading':heading,'home_description':copy,
  'home_kind':'landing','home_image_url':BASE+'/orgportal.svg','features':['events','chat'],
  'home_primary_label':'Explore hosted events','home_primary_href':'/org-events',
 }))['portal']
 assert setup['slug']==alias and setup['slug_url'].endswith('/orgs/'+a['slug'])
 assert '/portals/' not in setup['home_url'] and '/portals/' not in setup['public_base_url']
 expected=[]
 for index,org in enumerate([a,a,a,a,b]):
  title=f'Dummy Hosted {index} {run}';starts=(datetime.now(timezone.utc)+timedelta(days=30+index)).isoformat()
  good(owner.request.post(BASE+'/api/org/api/network/events',headers=auth,data={'title':title,'host_type':'org','host_org_id':org['id'],'starts_at':starts,'location':'Local fixture venue'}))
  if org is a:expected.append(title)
 guest=context();page=guest.new_page();page.goto(BASE+'/orgs/'+a['slug'],wait_until='domcontentloaded')
 expect(page.get_by_role('heading',name=heading,exact=True)).to_be_visible(timeout=30000)
 expect(page.get_by_text(copy,exact=True)).to_be_visible()
 expect(page.get_by_alt_text(a['name'],exact=True)).to_have_attribute('src',BASE+'/orgportal.svg')
 expect(page.get_by_role('link',name='Explore hosted events',exact=True)).to_have_attribute('href','#organization-events')
 for title in expected:expect(page.get_by_text(title,exact=True)).to_be_visible(timeout=30000)
 expect(page.get_by_text(f'Dummy Hosted 4 {run}',exact=True)).to_have_count(0)
 assert not any('/portals/' in href for href in page.locator('a[href]').evaluate_all('(links)=>links.map(a=>a.href)'))
 page.get_by_role('region',name='Organization branding',exact=True).get_by_role('link').click()
 expect(page).to_have_url(BASE+'/orgs/'+a['slug']+'?tab=branding')
 expect(page.get_by_role('heading',name='Approved imagery',exact=True)).to_be_visible(timeout=30000)
 page.get_by_role('tab',name='Info',exact=True).click()
 for width in [1280,390]:
  page.set_viewport_size({'width':width,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=f'/tmp/unified-organization-{width}.png',full_page=True)
 # Another org never picks up the first org's heading, copy or artwork.
 page.goto(BASE+'/orgs/'+b['slug'],wait_until='domcontentloaded')
 expect(page.get_by_role('heading',name=b['name'],exact=True)).to_be_visible(timeout=30000)
 expect(page.get_by_text(copy,exact=True)).to_have_count(0)
 for path in ['/portals/'+alias,'/portals/'+alias+'/branding']:
  page.goto(BASE+path,wait_until='domcontentloaded')
  expect(page.get_by_role('heading',name='Page not found',exact=True)).to_be_visible(timeout=30000)
  expect(page).to_have_url(BASE+path)
 browser.close();print('PASS: unified org homepage → configured copy/actions/imagery → all four hosted events, other group excluded → Branding tab → no retired links → retired routes not found → org isolation → desktop/mobile')
