#!/usr/bin/env python3
"""Real presentation-form clickthrough against an isolated local Docker deployment.

PLAYWRIGHT_BASE_URL=https://localhost:9457 \
ONBOARDING_PIDP_CONTAINER=team-form-test-identity-api \
python3 web/scripts/test-local-team-form.py

Uses synthetic accounts, a dummy host organization/event, and a dummy applicant
team. All requests stay on loopback; remote organization replication must be off.
"""
import csv
import json
import os
import secrets
import re
import uuid
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from local_browser_test_support import BASE, preflight, verification_link

preflight()
REPORT = Path(os.environ.get('TEAM_FORM_REPORT_DIR', '/tmp/orgportal-team-form-clickthrough'))
REPORT.mkdir(parents=True, exist_ok=True)
run_id = uuid.uuid4().hex[:10]

def successful(response):
    assert response.ok, f'Local fixture request failed: {response.status} {response.text()[:500]}'
    return response.json() if 'application/json' in response.headers.get('content-type', '') else {}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE', '/usr/bin/google-chrome'), headless=True, args=['--no-sandbox'])
    def context():
        ctx = browser.new_context(ignore_https_errors=True, reduced_motion='reduce')
        ctx.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in {'localhost', '127.0.0.1'} else route.abort())
        return ctx
    def account(ctx, role):
        credentials = {'email': f'team-form-{role}-{run_id}@example.com', 'password': secrets.token_urlsafe(32)}
        successful(ctx.request.post(BASE + '/pidp/auth/register', data={**credentials, 'full_name': f'Dummy {role} {run_id}'}))
        assert ctx.request.get(verification_link(credentials['email']), max_redirects=0).status == 303
        return credentials
    try:
        host = context()
        for path in ['/pidp/health', '/api/org/health']:
            assert host.request.get(BASE + path).ok
        replica = successful(host.request.get(BASE + '/api/org/api/network/replication/status'))
        assert replica['mode'] == 'primary', 'Fixture tests require replication disabled'
        credentials = account(host, 'host')
        successful(host.request.post(BASE + '/pidp/auth/session/login', form={'username': credentials['email'], 'password': credentials['password']}, headers={'Origin': BASE}))
        token = successful(host.request.get(BASE + '/pidp/auth/session-token'))['access_token']
        auth = {'Authorization': 'Bearer ' + token}
        successful(host.request.put(BASE + '/api/org/api/network/contact/me', headers=auth, data={'enabled': False}))
        colleague = context()
        colleague_credentials = account(colleague, 'colleague')
        successful(colleague.request.post(BASE + '/pidp/auth/session/login', form={'username': colleague_credentials['email'], 'password': colleague_credentials['password']}, headers={'Origin': BASE}))
        colleague_token = successful(colleague.request.get(BASE + '/pidp/auth/session-token'))['access_token']
        successful(colleague.request.get(BASE + '/api/org/api/accounts/me', headers={'Authorization': 'Bearer ' + colleague_token}))
        group = successful(host.request.post(BASE + '/api/org/api/network/orgs', headers=auth, data={'name': f'Dummy Demo Host {run_id}', 'city': 'Baltimore', 'kind': 'organization', 'description': 'An organization-owned introduction for the local community.', 'acknowledgeOwnership': True}))
        event = successful(host.request.post(BASE + '/api/org/api/network/events', headers=auth, data={'title': f'Dummy Demo Day {run_id}', 'host_type': 'org', 'host_org_id': group['id'], 'ingest_key': f'local-team-form-{run_id}', 'starts_at': '2099-11-17T23:00:00Z', 'ends_at': '2099-11-18T01:30:00Z', 'location': 'Local test venue', 'description': '## What to expect\n\n- A local demonstration.\n- A team presentation.'}))
        endpoint = BASE + '/api/org/api/network/events/' + event['id'] + '/presentations'
        successful(host.request.put(endpoint + '/form', headers=auth, data={'enabled': True}))
        applicant = context()
        credentials = account(applicant, 'applicant')
        # Provision a local cookie session; exercise the application itself through UI.
        successful(applicant.request.post(BASE + '/pidp/auth/session/login', form={'username': credentials['email'], 'password': credentials['password']}, headers={'Origin': BASE}))
        page = applicant.new_page()
        page.goto(BASE + '/events/' + event['slug'])
        section = page.get_by_role('region', name='Presentation applications', exact=True)
        form = page.get_by_role('form', name='Team presentation application')
        expect(page.get_by_role('heading', name='What to expect', exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_role('region', name='About '+group['name'],exact=True)).to_contain_text('An organization-owned introduction')
        page.set_viewport_size({'width':390,'height':1000})
        facts=page.get_by_role('region',name='Event date, time and place',exact=True)
        expect(facts).to_be_visible()
        assert facts.bounding_box()['y'] < page.locator('.public-event-description').bounding_box()['y']
        page.get_by_role('tab',name='Poster',exact=True).click()
        expect(page.get_by_role('tabpanel',name='Poster',exact=True)).to_be_visible()
        page.get_by_role('tab',name='Apply',exact=True).click()
        assert page.url.endswith('#apply'), 'Apply tab must survive reload and sign-in return'
        expect(form).to_be_visible(timeout=30000)
        expect(form.get_by_role('checkbox')).to_have_count(0)
        expect(page.locator('.public-event-description .bio-markdown li')).to_have_count(2)
        form.get_by_label('Team name', exact=True).fill(f'Dummy Demo Team {run_id}')
        form.get_by_label('City', exact=True).fill('Baltimore')
        form.get_by_label('About your team', exact=True).fill('A dummy organization for a local browser test.')
        form.get_by_label('Presentation title', exact=True).fill('A local demo')
        form.get_by_label('What will you present?', exact=True).fill('A synthetic demo to verify the submission flow.')
        picker = form.get_by_label('Person’s email or portal member name', exact=True)
        roster = form.get_by_role('list', name='Selected team members')
        for query, person in [(f'Dummy host {run_id}', f'Dummy host {run_id}'), (colleague_credentials['email'], f'Dummy colleague {run_id}')]:
            picker.fill(query)
            form.get_by_role('button', name='Choose ' + person, exact=True).click()
            expect(roster.get_by_role('img', name=person + ' · Status unavailable', exact=True)).to_be_visible()
        invitation_email = f'new-teammate-{run_id}@example.com'
        picker.fill(invitation_email)
        form.get_by_role('button', name=f'Invite {invitation_email} by email', exact=True).click()
        expect(roster.get_by_role('img', name=invitation_email + ' · Status unavailable', exact=True)).to_be_visible()
        expect(roster.get_by_role('listitem')).to_have_count(3)
        # Adding the same account again must not duplicate its avatar or membership.
        picker.fill(f'Dummy host {run_id}')
        form.get_by_role('button', name=f'Choose Dummy host {run_id}', exact=True).click()
        expect(roster.get_by_role('listitem')).to_have_count(3)
        expect(form).to_have_attribute('data-draft-saved', 'true', timeout=10000)
        expect(form).to_have_css('border-top-color', 'rgb(212, 175, 55)')
        page.get_by_role('tab',name='Info',exact=True).click()
        page.get_by_role('tab',name='Apply',exact=True).click()
        expect(form.get_by_label('Team name',exact=True)).to_have_value(f'Dummy Demo Team {run_id}')
        page.reload()
        page.get_by_role('tab',name='Apply',exact=True).click()
        expect(form.get_by_label('Team name', exact=True)).to_have_value(f'Dummy Demo Team {run_id}', timeout=30000)
        expect(form.get_by_label('What will you present?', exact=True)).to_have_value('A synthetic demo to verify the submission flow.')
        expect(form).to_have_attribute('data-draft-saved', 'true', timeout=10000)
        expect(roster.get_by_role('listitem')).to_have_count(3)
        expect(roster.get_by_role('img')).to_have_count(3)
        submit = form.get_by_role('button', name='Submit application', exact=True)
        assert form.evaluate('(form) => form.checkValidity()'), 'No ownership checkbox should block a complete application'
        for width, filename in [(1280, 'team-form-desktop.png'), (390, 'team-form-mobile.png')]:
            page.set_viewport_size({'width': width, 'height': 1000})
            submit.scroll_into_view_if_needed()
            style = submit.evaluate('(el) => {const s=getComputedStyle(el);return {height:el.getBoundingClientRect().height,radius:parseFloat(s.borderRadius),background:s.backgroundColor,color:s.color}}')
            assert style['height'] >= 44 and style['radius'] > 8
            assert style['background'] != style['color']
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal overflow'
            form.screenshot(path=str(REPORT / filename))
        # Verify the shared fallback also styles classless buttons outside the form.
        baseline = page.evaluate("""() => {const button=document.createElement('button');button.textContent='Baseline test';document.querySelector('main').append(button);const s=getComputedStyle(button);const result={height:button.getBoundingClientRect().height,radius:parseFloat(s.borderRadius)};button.remove();return result}""")
        assert baseline['height'] >= 44 and baseline['radius'] > 8
        with page.expect_response(lambda response: '/invitations/apply' in response.url and response.request.method == 'POST', timeout=30000) as invitation_response:
            submit.click()
        invitation_result = successful(invitation_response.value)
        assert invitation_result['saved'] and invitation_result['invitationId'], 'Email invitation must be queued'
        expect(section.get_by_role('status').filter(has_text='Application submitted to the event organizers.')).to_have_text('Application submitted to the event organizers.', timeout=30000)
        expect(section.get_by_role('heading', name=f'Dummy Demo Team {run_id}: A local demo')).to_be_visible(timeout=30000)
        expect(form.get_by_label('Presentation title', exact=True)).to_have_value('')
        page.reload()
        page.get_by_role('tab',name='Apply',exact=True).click()
        expect(section.get_by_role('heading', name=f'Dummy Demo Team {run_id}: A local demo')).to_be_visible(timeout=30000)
        saved = successful(host.request.get(endpoint, headers=auth))['submissions']
        assert len(saved) == 1 and saved[0]['title'] == 'A local demo'
        team_id = saved[0]['organization_id']
        applicant_token = successful(applicant.request.get(BASE + '/pidp/auth/session-token'))['access_token']
        membership = successful(applicant.request.get(BASE + '/api/org/api/network/orgs/' + team_id + '/membership', headers={'Authorization': 'Bearer ' + applicant_token}))
        assert membership['role'] == 'owner' and membership['status'] == 'active'
        members = successful(applicant.request.get(BASE + '/api/org/api/network/orgs/' + team_id + '/members', headers={'Authorization': 'Bearer ' + applicant_token}))
        assert sum(member['role'] == 'member' for member in members) == 2, members
        assert len(members) == 3, 'Unverified email must not create an identity or membership'
        # A real host dashboard must review every application across pages.
        for index in range(25):
            team = successful(host.request.post(BASE + '/api/org/api/network/orgs', headers=auth, data={'name': f'Dummy Review Team {run_id} {index}', 'city': 'Baltimore', 'kind': 'team', 'acknowledgeOwnership': True}))
            successful(host.request.put(endpoint + '/' + team['id'], headers=auth, data={'title': f'Review demo {index}', 'summary': 'Local application review fixture.'}))
        manager = host.new_page()
        manager.goto(BASE + '/events/' + event['slug'])
        manager.get_by_role('tab',name='Apply',exact=True).click()
        expect(manager.get_by_role('tab', name='Applications', exact=True)).to_have_attribute('aria-selected', 'true', timeout=30000)
        review = manager.get_by_role('region', name='Review applications', exact=True)
        expect(review.locator('.presentation-submission')).to_have_count(25, timeout=30000)
        expect(review.get_by_role('status').filter(has_text='Page 1 of 2')).to_contain_text('26 matching applications')
        review.get_by_role('button', name='Next page', exact=True).click()
        expect(review.locator('.presentation-submission')).to_have_count(1, timeout=30000)
        review.get_by_role('button', name='Previous page', exact=True).click()
        expect(review.locator('.presentation-submission')).to_have_count(25, timeout=30000)
        with manager.expect_download() as download_event:
            review.get_by_role('button', name='Export CSV', exact=True).click()
        exported=list(csv.DictReader(Path(download_event.value.path()).read_text(encoding='utf-8-sig').splitlines()))
        assert len(exported)==26, 'CSV must include all pages'
        review.locator('.presentation-submission').first.get_by_role('button',name='Accept',exact=True).click()
        expect(review.get_by_role('status').filter(has_text='marked accepted.')).to_be_visible(timeout=30000)
        review.get_by_label('Application status',exact=True).select_option('accepted')
        expect(review.locator('.presentation-submission')).to_have_count(1, timeout=30000)
        expect(review.get_by_role('status').filter(has_text='Page 1 of 1')).to_contain_text('1 matching applications')
        with manager.expect_download() as filtered_download:
            review.get_by_role('button', name='Export CSV', exact=True).click()
        filtered=list(csv.DictReader(Path(filtered_download.value.path()).read_text(encoding='utf-8-sig').splitlines()))
        assert len(filtered)==1 and filtered[0]['status']=='accepted'
        for width,filename in [(1280,'applications-desktop.png'),(390,'applications-mobile.png')]:
            manager.set_viewport_size({'width':width,'height':1000})
            assert manager.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Application review overflow'
            review.screenshot(path=str(REPORT/filename))
        review.locator('.presentation-submission').first.get_by_role('button',name='Mark pending',exact=True).click()
        expect(review.get_by_text('No accepted applications yet.',exact=True)).to_be_visible(timeout=30000)
        manager.get_by_role('tab',name='Team Form',exact=True).click()
        expect(manager.get_by_role('form',name='Team presentation application')).to_be_visible()
        page.get_by_role('tab',name='Submissions',exact=True).click()
        submissions=page.get_by_role('region',name='Event submissions',exact=True)
        expect(submissions.locator('.presentation-submission')).to_have_count(26,timeout=30000)
        for count in range(1,4):
            submissions.get_by_role('button',name=re.compile('^Favorite:')).first.click()
            expect(submissions.get_by_role('status')).to_have_text(f'{count} of 3 favorites selected',timeout=30000)
        expect(submissions.get_by_role('button',name=re.compile('^Favorite:')).first).to_be_disabled()
        page.reload()
        expect(submissions.get_by_role('status')).to_have_text('3 of 3 favorites selected',timeout=30000)
        submissions.get_by_role('button',name=re.compile('^Remove favorite:')).first.click()
        expect(submissions.get_by_role('status')).to_have_text('2 of 3 favorites selected',timeout=30000)
        expect(submissions.get_by_role('button',name=re.compile('^Favorite:')).first).to_be_enabled()
        guest=context().new_page()
        guest.goto(BASE+'/events/'+event['slug']+'#submissions')
        public_submissions=guest.get_by_role('region',name='Event submissions',exact=True)
        expect(public_submissions.locator('.presentation-submission')).to_have_count(26,timeout=30000)
        expect(public_submissions.get_by_role('link',name='Sign in',exact=True)).to_be_visible()
        page.get_by_role('tab',name='Apply',exact=True).click()
        section.get_by_role('button', name='Withdraw application', exact=True).click()
        expect(section.get_by_role('button', name='Withdraw application', exact=True)).to_have_count(0, timeout=30000)
        assert len(successful(host.request.get(endpoint, headers=auth))['submissions']) == 25
        successful(host.request.put(endpoint+'/form',headers=auth,data={'enabled':False}))
        page.reload()
        page.get_by_role('tab',name='Apply',exact=True).click()
        expect(page.get_by_text('Applications are not open for this event.',exact=True)).to_be_visible(timeout=30000)
        print('PASS: local authenticated session → dummy team creation → checkbox-free team submission → styled desktop/mobile form → submit → persisted application → manager tabs, counts, filters, pagination and full/filtered CSV → public Submissions tab → three favorites persist across reload → fourth blocked → remove favorite → guest view → withdraw; Markdown and global button fallback verified')
        print('Screenshots: ' + str(REPORT))
    finally:
        browser.close()
