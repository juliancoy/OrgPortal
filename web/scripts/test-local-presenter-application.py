#!/usr/bin/env python3
"""Presenter application clickthrough. Requires an isolated, writable local Docker stack.

PLAYWRIGHT_BASE_URL=https://localhost:19458 \
ONBOARDING_PIDP_CONTAINER=common-form-test-identity-api \
~/global/bin/python web/scripts/test-local-presenter-application.py
"""
import base64
import os
from pathlib import Path
import secrets
import json
import subprocess
import uuid
from urllib.parse import quote, urlparse
from playwright.sync_api import sync_playwright, expect
from local_browser_test_support import BASE, PIDP_CONTAINER, preflight

preflight()
REPORT = Path(os.environ.get('APPLICATION_REPORT_DIR', '/tmp/orgportal-presenter-application'))
REPORT.mkdir(parents=True, exist_ok=True)
run = uuid.uuid4().hex[:10]


def data(response):
    assert response.ok, f'Local fixture request failed ({response.status}): {response.text()[:300]}'
    return response.json() if "application/json" in response.headers.get("content-type", "") else {}


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    contexts = []

    def context():
        ctx = browser.new_context(ignore_https_errors=True, viewport={'width': 1280, 'height': 960}, reduced_motion='reduce')
        contexts.append(ctx)
        ctx.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in {'localhost', '127.0.0.1'} else route.abort())
        return ctx

    def account(ctx, label):
        email = f'presenter-{label}-{run}@example.com'
        password = secrets.token_urlsafe(24)
        registered = data(ctx.request.post(BASE + '/pidp/auth/register', data={'email': email, 'password': password, 'full_name': f'Presenter {label} {run}'}))
        # Local delivery intentionally logs no verification secrets. Verify only this
        # freshly created synthetic fixture, by UUID and exact email, in the test DB.
        assert PIDP_CONTAINER.startswith(('common-form-test-', 'team-form-test-'))
        fixture_script = """
import asyncio,json,sys,uuid
from datetime import datetime
from db import SessionLocal,engine
from models import User
payload=json.load(sys.stdin)
assert payload['email'].startswith('presenter-') and payload['email'].endswith('@example.com')
async def main():
 async with SessionLocal() as session:
  user=await session.get(User,uuid.UUID(payload['id']))
  assert user and user.email==payload['email'] and user.provider is None
  user.identity_data={**(user.identity_data or {}),'email_verified':True,'email_verified_at':datetime.utcnow().isoformat()}
  await session.commit()
 await engine.dispose()
asyncio.run(main())
"""
        result=subprocess.run(['docker','exec','-i','-w','/tmp','-e','PYTHONPATH=/app',PIDP_CONTAINER,'/venv/bin/python','-c',fixture_script],input=json.dumps({'id':registered['id'],'email':email}),text=True,capture_output=True)
        assert result.returncode==0, 'Local synthetic account verification failed'
        data(ctx.request.post(BASE + '/pidp/auth/session/login', form={'username': email, 'password': password}, headers={'Origin': BASE}))
        token = data(ctx.request.get(BASE + '/pidp/auth/session-token'))['access_token']
        auth = {'Authorization': 'Bearer ' + token}
        data(ctx.request.get(BASE + '/api/org/api/accounts/me', headers=auth))
        return auth

    def audit(page):
        if not page.evaluate('Boolean(window.axe)'):
            page.add_script_tag(path=str(Path(__file__).resolve().parents[1] / 'node_modules/axe-core/axe.min.js'))
        page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        violations = page.evaluate("""async()=> (await axe.run('.event-application-page', {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,checks:n.any.map(c=>c.data)}))}))""")
        assert not violations, {'theme':page.evaluate('document.documentElement.dataset.theme'),'computed':page.locator('.event-application-page').evaluate('(el)=>({color:getComputedStyle(el).color,label:getComputedStyle(el.querySelector("label")||el).color})'),'violations':violations}

    try:
        host = context()
        assert data(host.request.get(BASE + '/api/org/api/network/replication/status'))['mode'] == 'primary', 'Writable local fixtures require replication disabled'
        host_auth = account(host, 'host')
        group = data(host.request.post(BASE + '/api/org/api/network/orgs', headers=host_auth, data={'name': f'Local presenter host {run}', 'city': 'Baltimore', 'kind': 'organization', 'acknowledgeOwnership': True}))
        event = data(host.request.post(BASE + '/api/org/api/network/events', headers=host_auth, data={'title': f'Local Demo Day {run}', 'host_type': 'org', 'host_org_id': group['id'], 'ingest_key': 'presenter-ui-' + run, 'starts_at': '2099-11-17T23:00:00Z'}))
        endpoint = BASE + '/api/org/api/network/events/' + event['id'] + '/presentations'
        data(host.request.put(endpoint + '/form', headers=host_auth, data={'enabled': True}))
        event_path = '/events/' + event['slug']
        application_path = event_path + '/apply'
        applicant = context()
        applicant_auth = account(applicant, 'applicant')
        page = applicant.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + event_path)
        page.get_by_role('link', name='Apply to present', exact=True).click()
        expect(page).to_have_url(BASE + application_path)
        form = page.get_by_role('form', name='Team presentation application')
        expect(form).to_be_visible(timeout=30000)
        assert form.locator('.portal-card').count() == 0
        form.get_by_role('button', name='Submit application', exact=True).click()
        assert not form.evaluate('(form)=>form.checkValidity()')
        assert data(host.request.get(endpoint, headers=host_auth))['submissions'] == []
        form.get_by_label('Presentation title', exact=True).fill('Discard me')
        form.get_by_role('button', name='Clear saved draft', exact=True).click()
        expect(form.get_by_label('Presentation title', exact=True)).to_have_value('')
        form.get_by_label('Presentation title', exact=True).fill('Home rehabilitation research')
        form.get_by_label('Abstract', exact=True).fill('A local demonstration of accessible rehabilitation monitoring.')
        form.get_by_label('Team name', exact=True).fill('Local research team ' + run)
        form.get_by_label('Team members', exact=True).fill(f'Presenter host {run}')
        form.get_by_role('button', name=f'Choose Presenter host {run}', exact=True).click()
        invited = f'presenter-invite-{run}@example.com'
        form.get_by_label('Team members', exact=True).fill(invited)
        form.get_by_role('button', name=f'Invite {invited} by email', exact=True).click()
        expect(form.get_by_role('list', name='Selected team members').get_by_role('listitem')).to_have_count(3)
        expect(form).to_have_attribute('data-draft-saved', 'true')
        page.reload()
        expect(form.get_by_label('Presentation title', exact=True)).to_have_value('Home rehabilitation research', timeout=30000)
        expect(form.get_by_role('list', name='Selected team members').get_by_role('listitem')).to_have_count(3)
        form.locator('.application-optional-profile > summary').click()
        form.get_by_label('About your team', exact=True).fill('A local synthetic research team.')
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
        image = form.get_by_label('Team image (optional)', exact=True)
        image.set_input_files({'name': 'invalid.txt', 'mimeType': 'text/plain', 'buffer': b'invalid image'})
        expect(page.get_by_role('alert')).to_contain_text('Choose a JPEG')
        image.set_input_files({'name': 'team.png', 'mimeType': 'image/png', 'buffer': png})
        expect(form.get_by_role('img', name='Team image preview', exact=True)).to_be_visible()
        form.get_by_label('Add submission attachments', exact=True).set_input_files({'name': 'abstract.pdf', 'mimeType': 'application/pdf', 'buffer': b'%PDF-1.4\nLocal abstract'})
        for theme in ['light', 'dark']:
            page.evaluate('(theme)=>{localStorage.setItem("orgportal.theme",theme);document.documentElement.dataset.theme=theme}', theme)
            for width in [1280, 390]:
                page.set_viewport_size({'width': width, 'height': 960})
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Horizontal overflow'
                assert form.locator('.presentation-section').first.bounding_box()['width'] <= 674
                submit = form.get_by_role('button', name='Submit application', exact=True)
                assert submit.evaluate('(el)=>el.getBoundingClientRect().height') >= 44
                submit.focus()
                page.keyboard.press('Tab')
                page.keyboard.press('Shift+Tab')
                assert submit.evaluate('(el)=>getComputedStyle(el).outlineStyle') != 'none'
                audit(page)
                page.locator('.event-application-page').screenshot(path=str(REPORT / f'application-{width}-{theme}.png'))
        # A failed upload must not show confirmation or discard the staged file/draft.
        failed = [False]
        def fail_once(route):
            if route.request.method == 'POST' and not failed[0]:
                failed[0] = True
                expect(form).to_have_attribute('aria-busy', 'true')
                expect(form.get_by_label('Presentation title', exact=True)).to_be_disabled()
                expect(form.get_by_role('button', name='Saving application…', exact=True)).to_be_disabled()
                route.fulfill(status=503, content_type='application/json', body='{"message":"Local upload retry fixture"}')
            else:
                route.continue_()
        page.route('**/presentations/*/attachments', fail_once)
        form.get_by_role('button', name='Submit application', exact=True).click()
        expect(page.get_by_role('alert')).to_contain_text('an attachment could not upload', timeout=30000)
        assert page.get_by_role('alert').evaluate('(el)=>el===document.activeElement')
        expect(form).to_have_attribute('aria-busy', 'false')
        expect(form.get_by_text('abstract.pdf', exact=False)).to_be_visible()
        saved = data(host.request.get(endpoint, headers=host_auth))['submissions']
        assert len(saved) == 1
        submission_id, team_id = saved[0]['submission_id'], saved[0]['organization_id']
        assert len(saved[0]['presenters']) == 3
        public = data(host.request.get(endpoint + '/submissions'))['submissions'][0]
        assert public['image_url'], 'Organization image must be retained'
        form.get_by_role('button', name='Save changes', exact=True).click()
        expect(page.get_by_role('heading', name='Submission complete', exact=True)).to_be_visible(timeout=30000)
        audit(page)
        assert page.get_by_role('heading', name='Submission complete', exact=True).evaluate('(el)=>el===document.activeElement')
        assert len(data(host.request.get(endpoint, headers=host_auth))['submissions']) == 1, 'Retry must be idempotent'
        assert len(data(applicant.request.get(endpoint + '/' + submission_id + '/attachments', headers=applicant_auth))['attachments']) == 1
        page.get_by_role('link', name='View application', exact=True).click()
        expect(form.get_by_label('Applying as', exact=True)).to_be_disabled(timeout=30000)
        audit(page)
        form.get_by_label('Presentation title', exact=True).fill('Revised rehabilitation research')
        expect(form).to_have_attribute('data-draft-saved', 'true')
        page.reload()
        expect(form.get_by_label('Presentation title', exact=True)).to_have_value('Revised rehabilitation research', timeout=30000)
        form.get_by_role('button', name='Save changes', exact=True).click()
        expect(page.get_by_role('heading', name='Changes saved', exact=True)).to_be_visible(timeout=30000)
        page.get_by_role('link', name='View application', exact=True).click()
        expect(form.get_by_label('Presentation title', exact=True)).to_have_value('Revised rehabilitation research', timeout=30000)
        form.get_by_role('button', name='Cancel editing', exact=True).click()
        expect(page).to_have_url(BASE + event_path + '#submissions')
        page.get_by_role('link', name='Apply to present', exact=True).click()
        form.get_by_label('Applying as', exact=True).select_option(team_id)
        expect(form.get_by_label('Team name', exact=True)).to_have_count(0)
        expect(form.get_by_role('list', name='Selected team members').get_by_role('listitem')).to_have_count(3)
        data(host.request.put(endpoint + '/form', headers=host_auth, data={'enabled': False}))
        page.goto(BASE + application_path + '?edit=' + submission_id)
        expect(form.get_by_label('Presentation title', exact=True)).to_have_value('Revised rehabilitation research', timeout=30000)
        form.get_by_role('button', name='Save changes', exact=True).click()
        expect(page.get_by_role('heading', name='Changes saved', exact=True)).to_be_visible(timeout=30000)
        data(host.request.put(endpoint + '/form', headers=host_auth, data={'enabled': True}))
        guest = context()
        guest_page = guest.new_page()
        guest_page.goto(BASE + application_path + '?edit=' + submission_id)
        login = guest_page.get_by_role('link', name='Sign in to apply', exact=True)
        expect(login).to_have_attribute('href', '/users/login?next=' + quote(application_path + '?edit=' + submission_id, safe=''), timeout=30000)
        audit(guest_page)
        assert guest_page.get_by_role('form', name='Team presentation application').count() == 0
        assert guest.request.put(endpoint + '/' + submission_id, data={'organization_id': team_id, 'title': 'Unauthorized', 'summary': 'Denied'}).status in [401, 403]
        assert not errors, errors
        print('PASS: desktop/mobile light/dark; scoped WCAG checks; validation; local draft and edit reload; team/roster/image; public attachments; busy controls; failed-upload retry; closed-intake editing; confirmation focus; existing organization; guest return; unauthenticated denial.', flush=True)
    finally:
        for ctx in contexts:
            ctx.close()
        browser.close()
