#!/usr/bin/env python3
"""Consented class invitations on isolated Docker, with synthetic people and no external mail."""
import json,secrets,uuid
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from local_browser_test_support import BASE,preflight,verification_link,docker
preflight()
env=dict(item.split('=',1) for item in json.loads(docker('inspect','common-form-test-community-api'))[0]['Config']['Env'] if '=' in item)
assert env.get('EMAIL_SENDING_ENABLED')!='true','Local mail must be disabled'
run=uuid.uuid4().hex[:10]
def good(response):
 assert response.ok,f'{response.status}: {response.text()[:300]}'
 return response.json() if 'application/json' in response.headers.get('content-type','') else {}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 def context():
  ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1280,'height':1000})
  ctx.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in {'localhost','127.0.0.1'} else route.abort())
  return ctx
 def identity(ctx,email,name):
  password=secrets.token_urlsafe(32)
  good(ctx.request.post(BASE+'/pidp/auth/register',data={'email':email,'password':password,'full_name':name}))
  assert ctx.request.get(verification_link(email),max_redirects=0).status==303
  good(ctx.request.post(BASE+'/pidp/auth/session/login',form={'username':email,'password':password},headers={'Origin':BASE}))
  auth={'Authorization':'Bearer '+good(ctx.request.get(BASE+'/pidp/auth/session-token'))['access_token']}
  good(ctx.request.get(BASE+'/api/org/api/accounts/me',headers=auth));return auth
 try:
  host=context();assert good(host.request.get(BASE+'/api/org/api/network/replication/status'))['mode']=='primary'
  auth=identity(host,f'personnel-host-{run}@example.com','Dummy Personnel Host '+run)
  org=good(host.request.post(BASE+'/api/org/api/network/orgs',headers=auth,data={'name':'Dummy Personnel Org '+run,'city':'Baltimore','kind':'organization','acknowledgeOwnership':True}))
  base=BASE+'/api/org/api/network/orgs/'+org['id']
  preview=good(host.request.post(base+'/personnel/scheme/preview',headers=auth,data={'scheme':'corporation'}))
  good(host.request.post(base+'/personnel/scheme/apply',headers=auth,data={'scheme':'corporation','previewId':preview['previewId'],'confirm':True}))
  page=host.new_page();page.goto(BASE+'/orgs/'+org['slug']+'?tab=personnel',wait_until='domcontentloaded')
  panel=page.locator('.organization-personnel-invitations');panel.locator('summary').click()
  email=f'personnel-recipient-{run}@example.com'
  panel.get_by_label('Personnel invitation email',exact=True).fill(email)
  panel.get_by_role('checkbox',name='Advisor',exact=True).check();panel.get_by_role('checkbox',name='Board member',exact=True).check()
  panel.get_by_role('button',name='Review personnel invitation',exact=True).click()
  review=panel.get_by_role('region',name='Review personnel invitation update')
  expect(review).to_contain_text('No portal membership access.')
  with page.expect_response(lambda r:r.url.endswith('/invitations/apply') and r.request.method=='POST') as response:
   review.get_by_role('button',name='Confirm personnel invitation update',exact=True).click()
  invitation=good(response.value)
  expect(panel.get_by_role('list',name='Personnel invitation status')).to_contain_text(email)
  pending_card=page.locator('.organization-board:visible .organization-board-person-pending').filter(has=page.get_by_role('heading',name=email,exact=True))
  expect(pending_card).to_be_visible(timeout=30000)
  expect(pending_card).to_contain_text('Pending invitation')
  expect(pending_card).to_have_css('background-color','rgb(255, 247, 204)')
  guest=context();guestpage=guest.new_page();guestpage.goto(BASE+'/orgs/'+org['slug']+'?tab=personnel',wait_until='domcontentloaded')
  expect(guestpage.get_by_role('heading',name=org['name']+' Personnel',exact=True)).to_be_visible(timeout=30000)
  expect(guestpage.locator('.organization-board:visible .organization-board-person-pending')).to_have_count(0)
  assert email not in guestpage.locator('body').inner_text()
  recipient=context();recipient_auth=identity(recipient,email,'Dummy External Advisor '+run)
  target=recipient.new_page();target.goto(BASE+'/invitations/'+invitation['invitationId'])
  expect(target.get_by_role('heading',name=org['name'],exact=True)).to_be_visible(timeout=30000)
  expect(target.locator('main.page')).to_contain_text('No portal membership access.')
  target.get_by_role('button',name='Review acceptance',exact=True).click();target.get_by_role('button',name='Confirm acceptance',exact=True).click()
  expect(target.get_by_role('status')).to_have_text('Invitation accepted.')
  assert len(good(host.request.get(base+'/members',headers=auth)))==1
  public=BASE+'/api/org/api/network/orgs/public/'+org['slug']+'/personnel'
  people=good(host.request.get(public))['people'];assert len(people)==1 and people[0]['titles']==['Advisor']
  assert recipient.request.get(base+'/invitations',headers=recipient_auth).status==403
  panel.get_by_role('button',name='Refresh invitation status',exact=True).click()
  expect(panel).to_contain_text('pending confirmation')
  expect(page.locator('.organization-board:visible .organization-board-person-pending')).to_have_count(0,timeout=30000)
  panel.get_by_label('Supporting evidence URL',exact=True).fill(BASE+'/about')
  panel.get_by_role('button',name='Review class confirmation',exact=True).click()
  panel.get_by_role('button',name='Confirm personnel invitation update',exact=True).click()
  expect(panel).not_to_contain_text('pending confirmation')
  people=good(host.request.get(public))['people'];assert set(people[0]['titles'])=={'Advisor','Board member'}
  public_text=json.dumps(people);assert email not in public_text and '/about' not in public_text
  page.reload(wait_until='domcontentloaded')
  expect(page.locator('.organization-board-grid').get_by_text('Board member',exact=True)).to_be_visible(timeout=30000)
  for width in [1280,390]:
   page.set_viewport_size({'width':width,'height':1000})
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  print('PASS: intended classes and no-access preview → verified recipient acceptance → external public Advisor without membership → restricted Board class pending → organizer evidence confirmation → public Board class → status privacy, reload and desktop/mobile.')
 finally:browser.close()
