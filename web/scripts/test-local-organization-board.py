#!/usr/bin/env python3
"""Real Board/role editing against isolated Docker; synthetic accounts and org only."""
import os,json,secrets,uuid,re
from urllib.parse import urlparse,quote
from playwright.sync_api import sync_playwright,expect
from local_browser_test_support import BASE,preflight,verification_link
preflight();run=uuid.uuid4().hex[:10]
def good(response):
 assert response.ok,f'{response.status}: {response.text()[:300]}'
 return response.json() if 'application/json' in response.headers.get('content-type','') else {}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 def context():
  ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1280,'height':1000})
  ctx.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in {'localhost','127.0.0.1'} else route.abort())
  return ctx
 def account(ctx,label):
  name=f'Dummy Board {label} {run}';email=f'board-{label.lower()}-{run}@example.com';password=secrets.token_urlsafe(32)
  good(ctx.request.post(BASE+'/pidp/auth/register',data={'email':email,'password':password,'full_name':name}))
  assert ctx.request.get(verification_link(email),max_redirects=0).status==303
  good(ctx.request.post(BASE+'/pidp/auth/session/login',form={'username':email,'password':password},headers={'Origin':BASE}))
  token=good(ctx.request.get(BASE+'/pidp/auth/session-token'))['access_token'];auth={'Authorization':'Bearer '+token}
  good(ctx.request.get(BASE+'/api/org/api/accounts/me',headers=auth))
  good(ctx.request.put(BASE+'/api/org/api/network/contact/me',headers=auth,data={'enabled':False}))
  return name,email,auth
 owner=context();assert good(owner.request.get(BASE+'/api/org/api/network/replication/status'))['mode']=='primary'
 owner_name,owner_email,auth=account(owner,'Owner')
 colleague=context();colleague_name,colleague_email,colleague_auth=account(colleague,'Colleague')
 org=good(owner.request.post(BASE+'/api/org/api/network/orgs',headers=auth,data={'name':f'Dummy Board Organization {run}','city':'Baltimore','kind':'organization','acknowledgeOwnership':True}))
 base=BASE+'/api/org/api/network/orgs/'+org['id'];public=BASE+'/api/org/api/network/orgs/public/'+org['slug']+'/board'
 person=good(owner.request.get(BASE+'/api/org/api/network/users/lookup?q='+quote(colleague_name),headers=auth))['people'][0]
 assert person['user_name']==colleague_name
 payload={'user_id':person['user_id'],'user_name':person['user_name'],'role':'member','add_only':True}
 preview=good(owner.request.post(base+'/members/preview',headers=auth,data=payload));good(owner.request.post(base+'/members/apply',headers=auth,data={**payload,'previewId':preview['previewId']}))
 page=owner.new_page();page.goto(BASE+'/orgs/'+org['slug'],wait_until='domcontentloaded')
 page.get_by_role('tab',name='Board',exact=True).click()
 expect(page).to_have_url(BASE+'/orgs/'+org['slug']+'?tab=board')
 expect(page.get_by_role('heading',name=org['name']+' Board',exact=True)).to_be_visible(timeout=30000)
 roster=page.get_by_role('region',name='Community members',exact=True)
 expect(roster.locator('.organization-member-identity').filter(has_text=colleague_name)).to_be_visible(timeout=30000)
 def set_titles(person_name,values,portrait=None,description=None):
  item=roster.locator('li').filter(has=page.locator('.organization-member-identity').filter(has_text=person_name)).first
  item.get_by_role('button',name='Edit roles',exact=True).click()
  form=page.get_by_role('form',name='Roles for '+person_name,exact=True)
  form.get_by_label('Organization roles (one per line)').fill(values)
  if description is not None:
   form.get_by_label('Board description or bio',exact=True).fill(description)
  if portrait is not None:
   form.get_by_label('Personnel photo URL',exact=True).fill(portrait[0])
   form.get_by_label('Photo source page',exact=True).fill(portrait[1])
  form.get_by_role('button',name='Review roles',exact=True).click()
  expect(form.get_by_role('button',name='Save roles',exact=True)).to_be_enabled(timeout=30000)
  form.get_by_role('button',name='Save roles',exact=True).click()
  expect(form).to_have_count(0,timeout=30000)
 set_titles(owner_name,'CEO',description='Leads the synthetic organization.')
 set_titles(colleague_name,'CTO\nAdvisor',(BASE+'/laurel_wreath_logo.png',BASE+'/about'),description='Builds the synthetic research platform.')
 board=page.locator('.organization-board-grid')
 expect(board.get_by_role('heading',name=owner_name,exact=True)).to_be_visible(timeout=30000)
 expect(board.get_by_text('Builds the synthetic research platform.',exact=True)).to_be_visible();expect(board.get_by_text('CTO',exact=True)).to_be_visible();expect(board.get_by_text('Advisor',exact=True)).to_be_visible()
 expect(board.get_by_role('link',name='Photo source',exact=True)).to_have_attribute('href',BASE+'/about')
 expect(board.locator('img')).to_have_attribute('src',BASE+'/laurel_wreath_logo.png')
 page.wait_for_function("document.querySelector('.organization-board-grid img')?.naturalWidth>0")
 roles={row['user_id']:row for row in good(owner.request.get(base+'/members',headers=auth))}
 assert roles[person['user_id']]['role']=='member' and roles[person['user_id']]['titles']==['CTO','Advisor']
 assert any(row['role']=='owner' and row['titles']==['CEO'] for row in roles.values())
 assert colleague.request.post(base+'/members/'+person['user_id']+'/titles/preview',headers=colleague_auth,data={'titles':['CEO']}).status==403
 page.reload(wait_until='domcontentloaded');expect(page.locator('.organization-board-grid').get_by_text('CTO',exact=True)).to_be_visible(timeout=30000)
 roster=page.get_by_role('region',name='Community members',exact=True)
 set_titles(colleague_name,'Communications Officer')
 expect(board.get_by_text('Communications Officer',exact=True)).to_be_visible(timeout=30000)
 expect(board.get_by_text('CTO',exact=True)).to_have_count(0)
 for width in [1280,390]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  page.screenshot(path=f'/tmp/dummy-organization-board-{width}.png',full_page=True)
 guest=context();guestpage=guest.new_page();guestpage.goto(BASE+'/orgs/'+org['slug']+'?tab=board',wait_until='domcontentloaded')
 expect(guestpage.get_by_role('heading',name=colleague_name,exact=True)).to_be_visible(timeout=30000)
 expect(guestpage.get_by_role('button',name='Edit roles',exact=True)).to_have_count(0)
 assert owner_email not in guestpage.locator('body').inner_text() and colleague_email not in guestpage.locator('body').inner_text()
 payload=good(guest.request.get(public));assert all('user_id' not in row and 'email' not in row for row in payload['people'])
 set_titles(colleague_name,'',('',''),description='');expect(board.get_by_role('heading',name=colleague_name,exact=True)).to_have_count(0,timeout=30000)
 # Personnel also includes active members who have opted into a public profile.
 good(colleague.request.put(BASE+'/api/org/api/network/contact/me',headers=colleague_auth,data={'enabled':True}))
 page.get_by_role('tab',name='Personnel',exact=True).click()
 expect(page).to_have_url(BASE+'/orgs/'+org['slug']+'?tab=personnel')
 expect(page.get_by_role('heading',name=org['name']+' Personnel',exact=True)).to_be_visible(timeout=30000)
 expect(board.get_by_role('heading',name=colleague_name,exact=True)).to_be_visible(timeout=30000)
 guestpage.goto(BASE+'/orgs/'+org['slug']+'?tab=personnel',wait_until='domcontentloaded')
 expect(guestpage.locator('.organization-board-grid').get_by_role('heading',name=colleague_name,exact=True)).to_be_visible(timeout=30000)
 expect(guestpage.get_by_role('button',name='Edit roles',exact=True)).to_have_count(0)
 for width in [1280,390]:
  guestpage.set_viewport_size({'width':width,'height':1000})
  assert guestpage.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  guestpage.screenshot(path=f'/tmp/dummy-organization-personnel-{width}.png',full_page=True)
 browser.close();print('PASS: real Board/Personnel tabs → sourced photo preview/save/clear → owner/member role review/save → multiple roles → permissions retained → member denial → reload/edit/clear → public read/privacy → desktop/mobile')
