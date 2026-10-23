#!/usr/bin/env python3
"""Real anonymous page counting and manager reporting on isolated local Docker."""
import secrets,uuid
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
 email=f'page-statistics-{run}@example.com';password=secrets.token_urlsafe(32)
 good(owner.request.post(BASE+'/pidp/auth/register',data={'email':email,'password':password,'full_name':f'Dummy Statistics Owner {run}'}))
 assert owner.request.get(verification_link(email),max_redirects=0).status==303
 good(owner.request.post(BASE+'/pidp/auth/session/login',form={'username':email,'password':password},headers={'Origin':BASE}))
 token=good(owner.request.get(BASE+'/pidp/auth/session-token'))['access_token'];auth={'Authorization':'Bearer '+token}
 good(owner.request.get(BASE+'/api/org/api/accounts/me',headers=auth))
 def create(label):return good(owner.request.post(BASE+'/api/org/api/network/orgs',headers=auth,data={'name':f'Dummy {label} Statistics {run}','city':'Baltimore','kind':'organization','acknowledgeOwnership':True}))
 a,b=create('Alpha'),create('Beta')
 def report(org):return good(owner.request.get(BASE+'/api/org/api/network/orgs/'+org['id']+'/page-statistics?days=7',headers=auth))
 assert report(a)['total']==0 and report(b)['total']==0
 page=owner.new_page();requests=[]
 page.on('request',lambda req:requests.append(req) if req.url.endswith('/page-view') else None)
 def visit(page,org):
  with page.expect_response(lambda response:response.url.endswith('/public/'+org['slug']+'/page-view')) as counted:
   page.goto(BASE+'/orgs/'+org['slug'],wait_until='domcontentloaded')
  assert counted.value.status==204,counted.value.status
 visit(page,a);assert report(a)['total']==1
 # Each public top-level tab is still the same organization-page entry.
 for tab in ['Board','Personnel','Poster','Branding','Info']:
  page.get_by_role('tab',name=tab,exact=True).click()
  expect(page.get_by_role('tab',name=tab,exact=True)).to_have_attribute('aria-selected','true')
 assert report(a)['total']==1 and len(requests)==1
 assert not requests[0].headers.get('authorization') and not requests[0].headers.get('cookie') and requests[0].post_data=='{}'
 page.get_by_text('Page statistics · Managers only',exact=True).click()
 stats=page.get_by_role('region',name='Organization page statistics',exact=True)
 expect(stats.get_by_role('heading',name='Organization page views',exact=True)).to_be_visible(timeout=30000)
 expect(stats.get_by_text('Loading page statistics…',exact=True)).to_have_count(0,timeout=30000)
 expect(stats.locator('dl div').filter(has_text='Since tracking began').locator('dd')).to_have_text('1')
 stats.get_by_label('Daily breakdown').select_option('7');expect(stats.locator('tbody tr')).to_have_count(7,timeout=30000)
 # Guest reads count, but the report and its controls stay private.
 guest=context();guestpage=guest.new_page();visit(guestpage,a)
 expect(guestpage.get_by_text('Page statistics · Managers only',exact=True)).to_have_count(0)
 assert guest.request.get(BASE+'/api/org/api/network/orgs/'+a['id']+'/page-statistics').status==401
 assert report(a)['total']==2
 with page.expect_response(lambda response:response.url.endswith('/page-view')) as counted:page.reload(wait_until='domcontentloaded')
 assert counted.value.status==204 and report(a)['total']==3
 before=len(requests);page.goto(BASE+'/orgs/'+a['slug']+'/dashboard',wait_until='domcontentloaded')
 expect(page.get_by_role('heading',name=a['name'],exact=True)).to_be_visible(timeout=30000)
 assert len(requests)==before and report(a)['total']==3
 visit(page,b);assert report(b)['total']==1 and report(a)['total']==3
 page.get_by_text('Page statistics · Managers only',exact=True).click()
 stats=page.get_by_role('region',name='Organization page statistics',exact=True)
 expect(stats.locator('dl div').filter(has_text='Since tracking began').locator('dd')).to_have_text('1',timeout=30000)
 for width in [1280,390]:
  page.set_viewport_size({'width':width,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=f'/tmp/organization-page-statistics-{width}.png',full_page=True)
 # A failed count must not prevent the public page from loading.
 guestpage.route('**/page-view',lambda route:route.abort())
 guestpage.goto(BASE+'/orgs/'+b['slug'],wait_until='domcontentloaded')
 expect(guestpage.get_by_role('heading',name=b['name'],exact=True)).to_be_visible(timeout=30000)
 assert report(b)['total']==1
 browser.close();print('PASS: anonymous page counts → tab deduplication → private manager report → guest/reload/dashboard rules → organization isolation → failed beacon resilience → desktop/mobile')
