#!/usr/bin/env python3
"""Organization avatar colors on the real isolated local Docker stack.
PLAYWRIGHT_BASE_URL=https://localhost:9457 ONBOARDING_PIDP_CONTAINER=team-form-test-identity-api python3 web/scripts/test-local-personnel.py
"""
import os
import secrets
import uuid
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from local_browser_test_support import BASE, preflight, verification_link
preflight()
REPORT=Path('/tmp/orgportal-personnel-clickthrough');REPORT.mkdir(exist_ok=True)
run_id=uuid.uuid4().hex[:10]
def ok(response):
    assert response.ok, f'Local fixture request failed: {response.status} {response.text()[:500]}'
    return response.json() if 'application/json' in response.headers.get('content-type','') else {}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE','/usr/bin/google-chrome'),headless=True,args=['--no-sandbox'])
    def identity(label):
        ctx=browser.new_context(ignore_https_errors=True,reduced_motion='reduce')
        ctx.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in {'localhost','127.0.0.1'} else route.abort())
        credentials={'email':f'personnel-{label}-{run_id}@example.com','password':secrets.token_urlsafe(32)}
        name=f'Dummy {label} {run_id}'
        ok(ctx.request.post(BASE+'/pidp/auth/register',data={**credentials,'full_name':name}))
        assert ctx.request.get(verification_link(credentials['email']),max_redirects=0).status==303
        ok(ctx.request.post(BASE+'/pidp/auth/session/login',form={'username':credentials['email'],'password':credentials['password']},headers={'Origin':BASE}))
        token=ok(ctx.request.get(BASE+'/pidp/auth/session-token'))['access_token']
        auth={'Authorization':'Bearer '+token}
        person=ok(ctx.request.put(BASE+'/api/org/api/network/contact/me',headers=auth,data={'enabled':True}))
        person['local_test_email']=credentials['email']
        return ctx,auth,person,name
    try:
        host,auth,owner,owner_name=identity('Organizer')
        assert ok(host.request.get(BASE+'/api/org/api/network/replication/status'))['mode']=='primary'
        visitor,visitor_auth,person,person_name=identity('Visitor')
        def org(name):return ok(host.request.post(BASE+'/api/org/api/network/orgs',headers=auth,data={'name':f'Dummy {name} {run_id}','city':'Baltimore','kind':'organization','acknowledgeOwnership':True}))
        one,two=org('Org One'),org('Org Two')
        event=ok(host.request.post(BASE+'/api/org/api/network/events',headers=auth,data={'title':f'Dummy RSVP event {run_id}','host_type':'org','host_org_id':one['id'],'ingest_key':f'personnel-{run_id}','starts_at':'2099-11-17T23:00:00Z','ends_at':'2099-11-18T01:30:00Z'}))
        ok(visitor.request.post(BASE+'/api/org/api/network/events/'+event['id']+'/attendance',headers=visitor_auth,data={}))
        members=BASE+'/api/org/api/network/orgs/'+two['id']+'/members'
        body={'user_id':person['user_id'],'user_name':person_name,'role':'member'}
        preview=ok(host.request.post(members+'/preview',headers=auth,data=body))
        ok(host.request.post(members+'/apply',headers=auth,data={**body,'previewId':preview['previewId'],'confirm':True}))
        page=host.new_page()
        def avatar(status):return page.get_by_role('img',name=f'{person_name} · {status}',exact=True)
        page.goto(BASE+'/people?org='+one['id'])
        # Search the real directory so fixture visibility is independent of roster size.
        page.get_by_role('searchbox',name='Search people by name',exact=True).fill(run_id)
        expect(avatar('Attendee')).to_be_visible(timeout=30000)
        expect(avatar('Attendee')).to_have_css('border-top-color','rgb(53, 28, 117)')
        page.goto(BASE+'/orgs/'+one['slug']+'/dashboard')
        page.get_by_text('Participation status',exact=True).click()
        picker=page.get_by_role('searchbox',name='Person’s email or portal member name',exact=True)
        picker.fill(person['local_test_email'])
        page.get_by_role('button',name=f'Choose {person_name}',exact=True).click()
        box=page.locator('.organization-personnel-controls')
        expect(box).to_have_attribute('data-draft-saved','true',timeout=10000)
        expect(box).to_have_css('border-top-color','rgb(212, 175, 55)')
        page.reload()
        page.get_by_text('Participation status',exact=True).click()
        expect(picker).to_have_value(person_name,timeout=30000)
        expect(box).to_have_attribute('data-draft-saved','true',timeout=10000)
        box.screenshot(path=str(REPORT/'personnel-draft-gold.png'))
        page.evaluate('''() => {
          const key=Object.keys(localStorage).find(key=>key.includes(':personnel:'));
          const entry=JSON.parse(localStorage.getItem(key));entry.value.query='Changed in another tab';
          const raw=JSON.stringify(entry);localStorage.setItem(key,raw);
          dispatchEvent(new StorageEvent('storage',{key,newValue:raw}));
        }''')
        expect(box).to_have_attribute('data-draft-saved','false',timeout=10000)
        # Editing a restored selection clears its account ID until a new result is chosen.
        picker.fill(person_name+' ')
        expect(page.get_by_role('button',name='Award Volunteer status',exact=True)).to_be_disabled()
        picker.fill(person_name)
        page.get_by_role('button',name=f'Choose {person_name}',exact=True).click()
        expect(box).to_have_attribute('data-draft-saved','true',timeout=10000)

        page.get_by_role('button',name='Award Volunteer status',exact=True).click()
        page.get_by_role('button',name='Confirm personnel update',exact=True).click()
        expect(page.get_by_role('status').filter(has_text='Personnel update recorded.')).to_be_visible(timeout=30000)
        page.goto(BASE+'/people?org='+one['id'])
        page.get_by_role('searchbox',name='Search people by name',exact=True).fill(run_id)
        expect(avatar('Volunteer')).to_be_visible(timeout=30000)
        expect(avatar('Volunteer')).to_have_css('border-top-color','rgb(0, 0, 0)')
        page.screenshot(path=str(REPORT/'volunteer-desktop.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':900})
        expect(avatar('Volunteer')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile horizontal overflow'
        page.screenshot(path=str(REPORT/'volunteer-mobile.png'),full_page=True)
        page.goto(BASE+'/people?org='+two['id'])
        page.get_by_role('searchbox',name='Search people by name',exact=True).fill(run_id)
        expect(avatar('Member')).to_be_visible(timeout=30000)
        expect(avatar('Member')).to_have_css('border-top-color','rgb(255, 0, 0)')
        print('PASS: RSVP → purple Attendee; real UI volunteer preview/apply → black Volunteer; same person in a second org → red Member; desktop/mobile verified')
        print('Screenshots: '+str(REPORT))
    finally:browser.close()
