#!/usr/bin/env python3
"""Real presentation-form clickthrough against an isolated local Docker deployment.

PLAYWRIGHT_BASE_URL=https://localhost:9457 \
ONBOARDING_PIDP_CONTAINER=team-form-test-identity-api \
python3 web/scripts/test-local-team-form.py

Uses synthetic accounts, a dummy host organization/event, and a dummy applicant
team. All requests stay on loopback; remote organization replication must be off.

For attached Android Chrome, forward its DevTools socket and reverse the gateway
port with adb, then set PLAYWRIGHT_CDP_URL=http://127.0.0.1:9223.
"""
import subprocess
import csv
import base64
import io
import zipfile
import json
import os
import secrets
import re
import uuid
from pathlib import Path
from urllib.parse import quote, urlparse
from playwright.sync_api import sync_playwright, expect
from local_browser_test_support import BASE, preflight, verification_link

preflight()
REPORT = Path(os.environ.get('TEAM_FORM_REPORT_DIR', '/tmp/orgportal-team-form-clickthrough'))
REPORT.mkdir(parents=True, exist_ok=True)
run_id = uuid.uuid4().hex[:10]
current_status_case = 'setup'
def status_case(case_id):
    global current_status_case
    current_status_case = case_id

def record_status(status):
    suite = os.environ.get('ORGPORTAL_STATUS_SUITE')
    if suite:
        subprocess.run(['node', str(Path(__file__).resolve().parents[2] / 'scripts/test-status.mjs'),
                        'case', suite, current_status_case, status], check=True)


def successful(response):
    assert response.ok, f'Local fixture request failed: {response.status} {response.text()[:500]}'
    return response.json() if 'application/json' in response.headers.get('content-type', '') else {}

with sync_playwright() as p:
    cdp_url = os.environ.get('PLAYWRIGHT_CDP_URL')
    ws_url = os.environ.get('PLAYWRIGHT_WS_ENDPOINT')
    device_name = os.environ.get('PLAYWRIGHT_DEVICE', 'Desktop Chrome')
    assert not (cdp_url and ws_url), 'Choose one remote browser connection'
    if cdp_url:
        assert urlparse(cdp_url).hostname in {'localhost', '127.0.0.1'}, 'Use a local forwarded browser'
        browser = p.chromium.connect_over_cdp(cdp_url, timeout=30000)
    elif ws_url:
        assert urlparse(ws_url).hostname in {'localhost', '127.0.0.1'}, 'Use a local Docker browser'
        browser = p.chromium.connect(ws_url, timeout=30000, headers={'x-playwright-launch-options':json.dumps({'channel':'chromium','timeout':30000})})
    else:
        browser = p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE', '/usr/bin/google-chrome'), headless=True, args=['--no-sandbox'])
    record_status('passed')
    status_case('draft')
    test_contexts = []
    def context():
        device = {'no_viewport': True} if cdp_url else {key: value for key, value in p.devices[device_name].items() if key != 'default_browser_type'}
        ctx = browser.new_context(ignore_https_errors=True, reduced_motion='reduce', **device)
        test_contexts.append(ctx)
        ctx.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in {'localhost', '127.0.0.1'} else route.abort())
        return ctx
    def account(ctx, role):
        credentials = {'email': f'team-form-{role}-{run_id}@example.com', 'password': secrets.token_urlsafe(32)}
        successful(ctx.request.post(BASE + '/pidp/auth/register', data={**credentials, 'full_name': f'Dummy {role} {run_id}'}))
        assert ctx.request.get(verification_link(credentials['email']), max_redirects=0).status == 303
        return credentials
    def export_csv(page, review):
        if cdp_url:
            # Android CDP cannot save a browser download onto the runner's disk.
            # Read the actual export Blob in the browser: CDP can return an empty
            # response body for downloads on Android.
            page.evaluate("""() => {
                window.__teamFormExport = null;
                const original = URL.createObjectURL;
                URL.createObjectURL = function(blob) {
                    URL.createObjectURL = original;
                    blob.text().then(text => { window.__teamFormExport = text; });
                    return original.call(this, blob);
                };
            }""")
            with page.expect_response(lambda response: '/presentations/export?' in response.url) as exported_response:
                review.get_by_role('button', name='Export CSV', exact=True).click()
            assert exported_response.value.ok
            page.wait_for_function('window.__teamFormExport !== null')
            contents = page.evaluate('window.__teamFormExport')
            (REPORT / f'export-{len(list(REPORT.glob("export-*.csv")))}.csv').write_text(contents, encoding='utf-8')
            return list(csv.DictReader(contents.lstrip('\ufeff').splitlines()))
        with page.expect_download() as exported_download:
            review.get_by_role('button', name='Export CSV', exact=True).click()
        target = REPORT / f'export-{len(list(REPORT.glob("export-*.csv")))}.csv'
        exported_download.value.save_as(target)
        return list(csv.DictReader(target.read_text(encoding='utf-8-sig').splitlines()))
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
        successful(host.request.post(BASE+'/api/org/api/network/events/'+event['id']+'/attendance',headers=auth,data={'email_updates':False,'organization_announcements':False}))
        page = applicant.new_page()
        page.goto(BASE + '/events/' + event['slug'])
        section = page.get_by_role('region', name='Presentation applications', exact=True)
        form = page.get_by_role('form', name='Team presentation application')
        expect(page.get_by_role('heading', name='What to expect', exact=True)).to_be_visible(timeout=30000)
        page.get_by_role('button',name=re.compile('1 coming')).click()
        guests=page.get_by_role('dialog',name='1 coming',exact=True)
        expect(guests).to_be_visible()
        assert guests.evaluate('(dialog)=>dialog.matches(":modal")'), 'Guests must render in the browser top layer'
        profile=guests.get_by_role('link',name=re.compile('Dummy host'))
        profile_url=profile.get_attribute('href')
        profile.click()
        expect(page).to_have_url(BASE+profile_url)
        page.goto(BASE+'/events/'+event['slug'])
        expect(page.get_by_role('heading',name='What to expect',exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_role('region', name='About '+group['name'],exact=True)).to_contain_text('An organization-owned introduction')
        page.set_viewport_size({'width':390,'height':1000})
        facts=page.get_by_role('region',name='Event date, time and place',exact=True)
        expect(facts).to_be_visible()
        assert facts.bounding_box()['y'] < page.locator('.public-event-description').bounding_box()['y']
        page.get_by_role('tab',name='Poster',exact=True).click()
        expect(page.get_by_role('tabpanel',name='Poster',exact=True)).to_be_visible()
        page.get_by_role('tab',name='Apply',exact=True).click()
        assert page.url.endswith('#apply'), 'Apply tab must survive reload and sign-in return'
        ai_help = page.get_by_role('region', name='Apply with AI', exact=True)
        expect(ai_help).to_be_visible()
        expect(ai_help.get_by_label('Submission prompt', exact=True)).to_have_value(re.compile(r'Connect to ' + re.escape(BASE.rstrip('/')) + r'/mcp .*shared team list.*approval before submitting\.'))
        expect(ai_help.get_by_role('button', name='Copy prompt', exact=True)).to_be_visible()
        expect(form).to_be_visible(timeout=30000)
        if not cdp_url:
            assert page.evaluate('navigator.maxTouchPoints > 0') == bool(p.devices[device_name]['has_touch'])
        form.get_by_role('button', name='Submit application', exact=True).click()
        assert not form.evaluate('(el) => el.checkValidity()'), 'Empty required fields must block submission'
        assert successful(host.request.get(endpoint, headers=auth))['submissions'] == []
        form.get_by_label('Presentation title', exact=True).fill('Discard this draft')
        form.get_by_role('button', name='Clear saved draft', exact=True).click()
        expect(form.get_by_label('Presentation title', exact=True)).to_have_value('')
        expect(form.get_by_role('checkbox')).to_have_count(0)
        expect(form.get_by_label('Your role in this presentation',exact=True)).to_have_count(0)
        expect(page.locator('.public-event-description .bio-markdown li')).to_have_count(2)
        form.get_by_label('New team name', exact=True).fill(f'Dummy Demo Team {run_id}')
        form.get_by_label('City', exact=True).fill('Baltimore')
        form.get_by_label('About your team', exact=True).fill('A dummy organization for a local browser test.')
        form.get_by_label('Presentation title', exact=True).fill('A local demo')
        form.get_by_label('What will you present?', exact=True).fill('A synthetic demo to verify the submission flow.')
        print('PASS: required fields and clearing a draft', flush=True)
        record_status('passed')
        status_case('submission')
        picker = form.get_by_label('Teammates (Email or Portal Name)', exact=True)
        roster = form.get_by_role('list', name='Selected team members')
        for query, person in [(f'Dummy host {run_id}', f'Dummy host {run_id}'), (colleague_credentials['email'], f'Dummy colleague {run_id}')]:
            picker.fill(query)
            form.get_by_role('button', name='Choose ' + person, exact=True).click()
            expect(roster.get_by_role('img', name=person + ' · Status unavailable', exact=True)).to_be_visible()
        invitation_email = f'new-teammate-{run_id}@example.com'
        picker.fill(invitation_email)
        form.get_by_role('button', name=f'Invite {invitation_email} by email', exact=True).click()
        expect(roster.get_by_role('img', name=invitation_email + ' · Status unavailable', exact=True)).to_be_visible()
        expect(roster.get_by_role('listitem')).to_have_count(4)
        # Adding the same account again must not duplicate its avatar or membership.
        picker.fill(f'Dummy host {run_id}')
        form.get_by_role('button', name=f'Choose Dummy host {run_id}', exact=True).click()
        expect(roster.get_by_role('listitem')).to_have_count(4)
        expect(form).to_have_attribute('data-draft-saved', 'true', timeout=10000)
        assert form.evaluate('(el) => parseFloat(getComputedStyle(el).borderTopWidth) >= 1'), 'Form border must remain visible at the device pixel ratio'
        expect(form).to_have_css('border-top-style', 'solid')
        page.get_by_role('tab',name='Info',exact=True).click()
        page.get_by_role('tab',name='Apply',exact=True).click()
        expect(form.get_by_label('New team name',exact=True)).to_have_value(f'Dummy Demo Team {run_id}')
        page.reload()
        page.get_by_role('tab',name='Apply',exact=True).click()
        expect(form.get_by_label('New team name', exact=True)).to_have_value(f'Dummy Demo Team {run_id}', timeout=30000)
        expect(form.get_by_label('What will you present?', exact=True)).to_have_value('A synthetic demo to verify the submission flow.')
        expect(form).to_have_attribute('data-draft-saved', 'true', timeout=10000)
        expect(roster.get_by_role('listitem')).to_have_count(4)
        expect(roster.get_by_role('img')).to_have_count(4)
        form.get_by_label('Team image (optional)',exact=True).set_input_files({'name':'team-logo.png','mimeType':'image/png','buffer':base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')})
        expect(form.get_by_role('img',name='Team image preview')).to_be_visible()
        expect(page.get_by_role('tab',name='Apply',exact=True)).to_have_css('background-color','rgb(212, 175, 55)')
        pptx=io.BytesIO()
        with zipfile.ZipFile(pptx,'w') as archive:
            archive.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
            archive.writestr('ppt/presentation.xml','<presentation/>')
        form.get_by_label('Add submission attachments',exact=True).set_input_files([
            {'name':'demo-image.png','mimeType':'image/png','buffer':base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')},
            {'name':'demo-summary.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4\nLocal dummy submission'},
            {'name':'demo-slides.pptx','mimeType':'application/vnd.openxmlformats-officedocument.presentationml.presentation','buffer':pptx.getvalue()},
        ])
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
        expect(form.get_by_label('Presentation title', exact=True)).to_have_value('')
        page.get_by_role('tab',name='Submissions',exact=True).click()
        submissions=page.get_by_role('region',name='Event submissions',exact=True)
        expect(submissions.get_by_role('heading',name='A local demo',exact=True)).to_be_visible(timeout=30000)
        page.reload()
        expect(submissions.get_by_role('heading',name='A local demo',exact=True)).to_be_visible(timeout=30000)
        saved = successful(host.request.get(endpoint, headers=auth))['submissions']
        assert len(saved) == 1 and saved[0]['title'] == 'A local demo'
        team_id = saved[0]['organization_id']
        public_saved=successful(host.request.get(endpoint+'/submissions'))['submissions'][0]
        assert '/api/org/api/network/orgs/public/' in public_saved['image_url'], 'Upload must become the organization main image'
        assert host.request.get(public_saved['image_url']).ok


        applicant_token = successful(applicant.request.get(BASE + '/pidp/auth/session-token'))['access_token']
        membership = successful(applicant.request.get(BASE + '/api/org/api/network/orgs/' + team_id + '/membership', headers={'Authorization': 'Bearer ' + applicant_token}))
        assert membership['role'] == 'owner' and membership['status'] == 'active'
        assert len(saved[0]['presenters'])==4 and any(person.get('name')==f'Dummy applicant {run_id}' for person in saved[0]['presenters'])
        members = successful(applicant.request.get(BASE + '/api/org/api/network/orgs/' + team_id + '/members', headers={'Authorization': 'Bearer ' + applicant_token}))
        assert sum(member['role'] == 'member' for member in members) == 2, members
        assert len(members) == 3, 'Unverified email must not create an identity or membership'
        host_user_id = next(person['userId'] for person in saved[0]['presenters'] if person.get('name')==f'Dummy host {run_id}')
        expect(page.get_by_text('Review applications', exact=True)).to_have_count(0)
        print('PASS: registration popup and profile link, saved form draft, teammate lookup/invitation and initial submission',flush=True)
        record_status('passed')
        status_case('review')
        # A real host dashboard must review every application across pages.
        for index in range(25):
            team = successful(host.request.post(BASE + '/api/org/api/network/orgs', headers=auth, data={'name': f'Dummy Review Team {run_id} {index}', 'city': 'Baltimore', 'kind': 'team', 'acknowledgeOwnership': True}))
            successful(host.request.put(endpoint + '/' + team['id'], headers=auth, data={'title': f'Review demo {index}', 'summary': 'Local application review fixture.', 'presenters':[{'userId':host_user_id}]}))
        manager = host.new_page()
        manager.goto(BASE + '/events/' + event['slug'])
        manager.get_by_role('tab',name='Submissions',exact=True).click()
        expect(manager.get_by_role('tablist',name='Presentation management')).to_have_count(0)
        manager.get_by_text('Review applications',exact=True).click()
        review = manager.get_by_role('region', name='Review applications', exact=True)
        expect(review.locator('.presentation-submission')).to_have_count(25, timeout=30000)
        expect(review.get_by_role('status').filter(has_text='Page 1 of 2')).to_contain_text('26 matching applications')
        review.get_by_role('button', name='Next page', exact=True).click()
        expect(review.locator('.presentation-submission')).to_have_count(1, timeout=30000)
        review.get_by_role('button', name='Previous page', exact=True).click()
        expect(review.locator('.presentation-submission')).to_have_count(25, timeout=30000)
        exported=export_csv(manager, review)
        assert len(exported)==26, f'CSV must include all pages; got {len(exported)} rows'
        review.locator('.presentation-submission').first.get_by_role('button',name='Accept',exact=True).click()
        expect(review.get_by_role('status').filter(has_text='marked accepted.')).to_be_visible(timeout=30000)
        review.get_by_label('Application status',exact=True).select_option('accepted')
        expect(review.locator('.presentation-submission')).to_have_count(1, timeout=30000)
        expect(review.get_by_role('status').filter(has_text='Page 1 of 1')).to_contain_text('1 matching applications')
        filtered=export_csv(manager, review)
        assert len(filtered)==1 and filtered[0]['status']=='accepted'
        for width,filename in [(1280,'applications-desktop.png'),(390,'applications-mobile.png')]:
            manager.set_viewport_size({'width':width,'height':1000})
            assert manager.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Application review overflow'
            review.screenshot(path=str(REPORT/filename))
        review.locator('.presentation-submission').first.get_by_role('button',name='Mark pending',exact=True).click()
        expect(review.get_by_text('No accepted applications yet.',exact=True)).to_be_visible(timeout=30000)
        manager.get_by_role('tab',name='Apply',exact=True).click()
        expect(manager.get_by_role('form',name='Team presentation application')).to_be_visible()
        print('PASS: manager pagination, CSV exports and review decisions',flush=True)
        record_status('passed')
        status_case('favorites')
        page.bring_to_front()
        page.reload()  # The host created review fixtures in another browser context.
        page.get_by_role('tab',name='Submissions',exact=True).click()
        submissions=page.get_by_role('region',name='Event submissions',exact=True)
        expect(submissions.locator('.presentation-submission')).to_have_count(26,timeout=30000)
        first_card=submissions.locator('.presentation-submission').first
        expand=first_card.get_by_role('button',name=re.compile('^Expand submission:'))
        expect(expand).to_have_attribute('aria-expanded','false')
        expand.click()
        expect(first_card.get_by_role('button',name=re.compile('^Collapse submission:'))).to_have_attribute('aria-expanded','true')
        expect(submissions.get_by_role('status').filter(has_text=re.compile(r'^\d+ of \d+ favorites selected$'))).to_have_text('0 of 3 favorites selected')
        first_card.get_by_role('button',name=re.compile('^Collapse submission:')).click()
        expect(expand).to_have_attribute('aria-expanded','false')
        for count in range(1,4):
            submissions.get_by_role('button',name=re.compile('^Favorite:')).first.click(position={'x':12,'y':70})
            expect(submissions.get_by_role('status').filter(has_text=re.compile(r'^\d+ of \d+ favorites selected$'))).to_have_text(f'{count} of 3 favorites selected',timeout=30000)
            expect(submissions.locator('.submission-voting-card.is-selected')).to_have_count(count)
        submissions.get_by_role('button',name=re.compile('^Favorite:')).first.click(position={'x':12,'y':70})
        quota=submissions.get_by_role('region',name='Manage your stars')
        expect(quota).to_be_visible()
        expect(quota.get_by_role('button',name=re.compile('^Remove star:'))).to_have_count(3)
        quota.get_by_role('button',name='Keep my stars').click()
        page.reload()
        expect(submissions.get_by_role('status').filter(has_text=re.compile(r'^\d+ of \d+ favorites selected$'))).to_have_text('3 of 3 favorites selected',timeout=30000)
        submissions.get_by_role('button',name=re.compile('^Remove favorite:')).first.click(position={'x':12,'y':70})
        expect(submissions.get_by_role('status').filter(has_text=re.compile(r'^\d+ of \d+ favorites selected$'))).to_have_text('2 of 3 favorites selected',timeout=30000)
        expect(submissions.get_by_role('button',name=re.compile('^Favorite:')).first).to_be_enabled()
        guest=context().new_page()
        guest.goto(BASE+'/events/'+event['slug']+'#submissions')
        public_submissions=guest.get_by_role('region',name='Event submissions',exact=True)
        expect(public_submissions.locator('.presentation-submission')).to_have_count(26,timeout=30000)
        expect(public_submissions.get_by_role('link',name='Sign in',exact=True)).to_be_visible()
        guest.get_by_role('tab', name='Apply', exact=True).click()
        login = guest.get_by_role('link', name='Log In', exact=True)
        expect(login).to_have_attribute('href', '/users/login?next=' + quote('/events/' + event['slug'] + '#apply', safe=''))
        expect(guest.get_by_role('form', name='Team presentation application')).to_have_count(0)
        guest.get_by_role('tab', name='Submissions', exact=True).click()
        public_team=public_submissions.locator('.presentation-submission').filter(has=guest.get_by_role('heading',name='A local demo',exact=True))
        public_team.get_by_role('button',name='Expand submission: A local demo',exact=True).click()
        expect(public_team.get_by_role('img',name='demo-image.png',exact=True)).to_be_visible()
        presenters=public_team.get_by_role('region',name='Team members',exact=True)
        expect(presenters.locator('summary')).to_contain_text('4 teammates')
        expect(presenters.locator('summary .public-event-registrant')).to_have_count(4)
        presenters.locator('summary').click()
        expect(presenters.get_by_text(f'Dummy host {run_id}',exact=True)).to_be_visible()
        expect(presenters.get_by_text(f'Dummy colleague {run_id}',exact=True)).to_be_visible()
        assert f'Dummy applicant {run_id}' in presenters.inner_text() and invitation_email not in presenters.inner_text()
        for name,content_type in [('demo-summary.pdf','application/pdf'),('demo-slides.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation')]:
            link=public_team.get_by_role('link').filter(has_text=name)
            response=guest.request.get(BASE+link.get_attribute('href'))
            assert response.ok and response.headers['content-type']==content_type
        page.bring_to_front()
        own_team=submissions.locator('.presentation-submission').filter(has=page.get_by_role('heading',name='A local demo',exact=True))
        own_team.get_by_role('button',name='Expand submission: A local demo',exact=True).click()
        expect(submissions.get_by_role('status').filter(has_text=re.compile(r'^\d+ of \d+ favorites selected$'))).to_have_text('2 of 3 favorites selected')
        expect(own_team.get_by_role('heading',name='Attachments',exact=True)).to_have_count(0)
        with page.expect_file_chooser() as selected:
            own_team.get_by_role('button',name='Add attachments',exact=True).click()
        selected.value.set_files({'name':'extra.txt','mimeType':'text/plain','buffer':b'Extra local attachment'})
        own_team.get_by_role('button',name='Upload attachments',exact=True).click()
        expect(own_team.get_by_role('link').filter(has_text='extra.txt')).to_be_visible(timeout=30000)
        for width in [1280,390]:
            page.set_viewport_size({'width':width,'height':1000})
            expect(own_team.locator('.submission-presenter-summary')).to_contain_text('4 teammates')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            box=own_team.bounding_box()
            assert box['x']>=0 and box['x']+box['width']<=width+1, 'Submission card must fit the viewport'
            own_team.screenshot(path=str(REPORT/f'compact-submission-{width}.png'))
        own_team.get_by_role('button',name='Delete attachment demo-summary.pdf',exact=True).click()
        expect(own_team.get_by_role('link').filter(has_text='demo-summary.pdf')).to_have_count(0,timeout=30000)
        manager.bring_to_front()
        manager.get_by_role('tab',name='Submissions',exact=True).click()
        settings=manager.get_by_role('form',name='Submission voting settings',exact=True)
        settings.get_by_label('Maximum favorites per person',exact=True).fill('4')
        settings.get_by_role('button',name='Save favorite limit',exact=True).click()
        expect(manager.get_by_role('region',name='Event submissions').get_by_role('status')).to_have_text('0 of 4 favorites selected',timeout=30000)
        page.bring_to_front()
        page.reload()
        expect(submissions.get_by_role('status').filter(has_text=re.compile(r'^\d+ of \d+ favorites selected$'))).to_have_text('2 of 4 favorites selected',timeout=30000)
        manager.bring_to_front()
        settings.get_by_label('Maximum favorites per person',exact=True).fill('1')
        settings.get_by_role('button',name='Save favorite limit',exact=True).click()
        expect(manager.get_by_role('region',name='Event submissions').get_by_role('alert')).to_contain_text('cannot be lower than an existing ballot',timeout=30000)
        page.bring_to_front()
        page.get_by_role('tab',name='Apply',exact=True).click()
        print('PASS: card voting, favorite limits, shared team roster and attachments',flush=True)
        record_status('passed')
        status_case('editing')
        # Same person and same team: create an independent second application.
        form.get_by_label('Team or organization',exact=True).select_option(team_id)
        form.get_by_label('Presentation title',exact=True).fill('A second local demo')
        form.get_by_label('What will you present?',exact=True).fill('A separate proposal from the same team.')
        picker.fill(f'Dummy host {run_id}')
        form.get_by_role('button',name=f'Choose Dummy host {run_id}',exact=True).click()
        form.get_by_label('Add submission attachments',exact=True).set_input_files({'name':'second.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4\nSecond proposal'})
        form.get_by_role('button',name='Submit application',exact=True).click()
        page.get_by_role('tab',name='Submissions',exact=True).click()
        expect(submissions.get_by_role('button',name='Edit application',exact=True)).to_have_count(2,timeout=30000)
        saved=successful(host.request.get(endpoint,headers=auth))['submissions']
        own=[row for row in saved if row['organization_id']==team_id]
        assert len(own)==2 and len({row['submission_id'] for row in own})==2
        original=submissions.locator('.presentation-submission').filter(has=page.get_by_role('heading',name='A local demo',exact=True))
        successful(host.request.put(endpoint+'/form',headers=auth,data={'enabled':False}))
        page.reload()
        original.get_by_role('button',name='Edit application',exact=True).click()
        expect(form.get_by_label('Presentation title',exact=True)).to_have_value('A local demo')
        expect(form.get_by_label('Team or organization',exact=True)).to_be_disabled()
        expect(form.get_by_label('Your role in this presentation',exact=True)).to_have_count(0)
        expect(form.get_by_role('list',name='Selected team members').get_by_role('listitem')).to_have_count(4)
        form.get_by_label('Presentation title',exact=True).fill('A revised local demo')
        form.get_by_label('What will you present?',exact=True).fill('Revised after intake closed.')
        form.get_by_role('button',name='Save changes',exact=True).click()
        page.get_by_role('tab',name='Submissions',exact=True).click()
        expect(submissions.get_by_role('heading',name='A revised local demo',exact=True)).to_be_visible(timeout=30000)
        page.reload()
        saved=successful(host.request.get(endpoint,headers=auth))['submissions']
        own=[row for row in saved if row['organization_id']==team_id]
        assert len(own)==2 and any(row['title']=='A second local demo' for row in own)
        revised_saved=next(row for row in own if row['title']=='A revised local demo')
        assert len(revised_saved['presenters'])==4, 'Editing must preserve the shared team members'
        revised=submissions.locator('.presentation-submission').filter(has=page.get_by_role('heading',name='A revised local demo',exact=True))
        revised.get_by_role('button',name='Delete application',exact=True).click()
        deletion=page.get_by_role('dialog',name='Are you sure?',exact=True)
        expect(deletion).to_be_visible()
        deletion.get_by_role('button',name='Cancel',exact=True).click()
        expect(revised).to_be_visible()
        revised.get_by_role('button',name='Delete application',exact=True).click()
        deletion.get_by_role('button',name='Delete application',exact=True).click()
        expect(submissions.get_by_role('button',name='Delete application',exact=True)).to_have_count(1,timeout=30000)
        second=next(row for row in own if row['title']=='A second local demo')
        remaining_files=successful(applicant.request.get(endpoint+'/'+second['submission_id']+'/attachments'))['attachments']
        assert [file['name'] for file in remaining_files]==['second.pdf']
        submissions.get_by_role('button', name='Delete application', exact=True).click()
        deletion.get_by_role('button',name='Delete application',exact=True).click()
        expect(submissions.get_by_role('button', name='Delete application', exact=True)).to_have_count(0, timeout=30000)
        assert len(successful(host.request.get(endpoint, headers=auth))['submissions']) == 25
        record_status('passed')
        status_case('finals')
        # Final round: a host chooses six, independent ballots update other sessions live.
        manager.bring_to_front()
        final_host=manager.get_by_role('region',name='Final presentation vote',exact=True)
        final_host.get_by_role('button',name='Choose finalists',exact=True).click()
        expect(final_host.get_by_role('checkbox')).to_have_count(25,timeout=30000)
        assert final_host.get_by_role('checkbox').evaluate_all('(els)=>els.filter(el=>el.checked).length') == 6
        final_host.get_by_role('button',name='Save finalists',exact=True).click()
        expect(final_host.get_by_role('status')).to_have_text('Finalists saved.',timeout=30000)
        final_host.get_by_role('button',name='Choose finalists',exact=True).click()
        expect(final_host.get_by_role('checkbox')).to_have_count(25,timeout=30000)
        final_host.get_by_role('checkbox').last.check()
        assert final_host.get_by_role('checkbox').evaluate_all('(els)=>els.filter(el=>el.checked).length') == 7
        final_host.get_by_role('checkbox').last.uncheck()
        final_host.get_by_role('button',name='Open final voting',exact=True).click()
        expect(final_host.get_by_role('button',name='Close final voting',exact=True)).to_be_visible(timeout=30000)
        final_data=successful(host.request.get(endpoint+'/final-round'))
        assert final_data['phase']=='open' and len(final_data['results'])==6
        assert all(row['votes']==0 for row in final_data['results']), 'Preliminary favorites must never become final votes'
        first_final,last_final=final_data['results'][0],final_data['results'][-1]
        final_user=page.get_by_role('region',name='Final presentation vote',exact=True)
        final_guest=guest.get_by_role('region',name='Final presentation vote',exact=True)
        expect(final_user.get_by_role('list',name='Live final vote results',exact=True).get_by_role('listitem')).to_have_count(6,timeout=15000)
        page.bring_to_front()
        final_user.get_by_role('button',name='Vote: '+first_final['organization_name'],exact=True).click()
        expect(final_user.get_by_role('button',name='Your vote: '+first_final['organization_name'],exact=True)).to_have_attribute('aria-pressed','true',timeout=30000)
        manager.bring_to_front()
        final_host.get_by_role('button',name='Vote: '+last_final['organization_name'],exact=True).click()
        guest.bring_to_front()
        expect(final_guest.get_by_text(re.compile('^Tied for the lead:'))).to_be_visible(timeout=15000)
        expect(final_guest.get_by_role('button',name=re.compile('^(Vote|Your vote):'))).to_have_count(0)
        page.bring_to_front()
        final_user.get_by_role('button',name='Vote: '+last_final['organization_name'],exact=True).click()
        guest.bring_to_front()
        chart=final_guest.get_by_role('list',name='Live final vote results',exact=True)
        expect(chart.get_by_role('listitem').first.locator('strong')).to_have_text(last_final['organization_name'],timeout=15000)
        expect(chart.get_by_role('listitem').first).to_contain_text('2 votes (100%)',timeout=15000)
        for width in [1280,390]:
            guest.set_viewport_size({'width':width,'height':1000})
            assert guest.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Live chart must fit the viewport'
            final_guest.screenshot(path=str(REPORT/f'final-vote-chart-{width}.png'))
        manager.bring_to_front()
        final_host.get_by_role('button',name='Close final voting',exact=True).click()
        guest.bring_to_front()
        expect(final_guest.get_by_text('Winner: '+last_final['organization_name'],exact=True)).to_be_visible(timeout=15000)
        assert applicant.request.put(endpoint+'/final-ballot',headers={'Authorization':'Bearer '+applicant_token},data={'submissionId':first_final['submission_id']}).status==409
        page.bring_to_front()
        page.reload()
        expect(final_user.locator('.presentation-results li.is-selected')).to_contain_text(last_final['organization_name'],timeout=30000)
        expect(final_user.get_by_role('button',name=re.compile('^(Vote|Your vote):'))).to_have_count(0)
        manager.bring_to_front()
        final_host.get_by_role('button',name='Reopen final voting',exact=True).click()
        page.bring_to_front()
        expect(final_user.get_by_role('button',name='Your vote: '+last_final['organization_name'],exact=True)).to_have_attribute('aria-pressed','true',timeout=15000)
        print('PASS: host shortlist, separate single-choice final ballot, live ranked bars across sessions, ties, changing votes and closing/reopening',flush=True)
        record_status('passed')
        status_case('closure')
        successful(host.request.put(endpoint+'/form',headers=auth,data={'enabled':False}))
        page.reload()
        page.get_by_role('tab',name='Apply',exact=True).click()
        expect(page.get_by_text('Applications are not open for this event.',exact=True)).to_be_visible(timeout=30000)
        print('PASS: create a team with one shared member roster, private invitations and shared-roster edits; multiple same-team submissions, editing after intake closes, independent attachments and withdrawal; local authenticated session → dummy team creation → checkbox-free team submission → styled desktop/mobile form → submit → persisted application → manager tabs, counts, filters, pagination and full/filtered CSV → image/PDF/PowerPoint upload and public download → attachment removal → public Submissions tab → three favorites persist across reload → fourth blocked → remove favorite → guest view → manager changes favorite limit → withdraw; Markdown and global button fallback verified')
        record_status('passed')
        status_case('status-page')
        status_page=context().new_page()
        status_page.goto(BASE+'/test-status')
        expect(status_page.get_by_role('heading',name='Test status',exact=True)).to_be_visible(timeout=30000)
        expect(status_page.get_by_text('OrgPortal tests',exact=True)).to_be_visible()
        assert status_page.locator('.test-status-category').count() >= 10
        sample={'version':1,'title':'Dashboard fixture','environment':'Local fixture','groups':[
            {'id':'sample','label':'Sample suite','category':'Submission and voting','cases':[
                {'id':'pass','label':'A passed check','status':'passed'},
                {'id':'fail','label':'A failed check','status':'failed'},
                {'id':'idle','label':'An unrun check','status':'not_run'}]}]}
        status_page.route('**/test-status.json',lambda route:route.fulfill(json=sample))
        status_page.reload()
        overview=status_page.get_by_role('region',name='All test results',exact=True)
        for label in ['1 passed','1 failed','1 not run']:
            expect(overview.get_by_text(label,exact=True)).to_be_visible()
        category=status_page.locator('.test-status-category')
        summary=category.locator('summary').first
        assert '33.3333' in summary.get_attribute('style') and '66.6666' in summary.get_attribute('style'), 'Category fill must match all three proportions'
        expect(status_page.get_by_text('A passed check',exact=True)).not_to_be_visible()
        summary.click()
        category.locator('details summary').click()
        colors=[]
        for label,outcome in [('A passed check','Passed'),('A failed check','Failed'),('An unrun check','Not run')]:
            row=status_page.locator('.test-status-check').filter(has_text=label)
            expect(row).to_be_visible()
            expect(row.locator('strong')).to_have_text(outcome)
            colors.append(row.evaluate('(el)=>getComputedStyle(el).backgroundColor'))
        assert len(set(colors))==3, 'Passed, failed and unrun checks need different fills'
        for width in [1280,390]:
            status_page.set_viewport_size({'width':width,'height':1000})
            assert status_page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            status_page.screenshot(path=str(REPORT/f'test-status-{width}.png'))
        status_page.unroute('**/test-status.json')
        status_page.route('**/test-status.json',lambda route:route.fulfill(status=500,body='Unavailable'))
        status_page.get_by_role('button',name='Refresh results',exact=True).click()
        expect(status_page.get_by_role('status')).to_contain_text('Could not refresh results')
        expect(overview.get_by_text('1 passed',exact=True)).to_be_visible()
        status_page.unroute('**/test-status.json')
        status_page.route('**/test-status.json',lambda route:route.fulfill(json={**sample,'environment':{'invalid':'metadata'}}))
        status_page.get_by_role('button',name='Refresh results',exact=True).click()
        expect(status_page.get_by_role('status')).to_contain_text('Could not refresh results')
        expect(overview.get_by_text('1 passed',exact=True)).to_be_visible()
        status_page.unroute('**/test-status.json')
        status_page.route('**/test-status.json',lambda route:route.fulfill(status=404,body='Not found'))
        status_page.get_by_role('button',name='Refresh results',exact=True).click()
        expect(status_page.get_by_role('status')).to_contain_text('No recorded results')
        expect(overview.get_by_text('0 passed',exact=True)).to_be_visible()
        expect(overview.get_by_text('0 failed',exact=True)).to_be_visible()
        record_status('passed')
        print('PASS: OrgPortal test dashboard, expandable categories, counts, proportional colors, unavailable/missing reports and desktop/mobile layout',flush=True)
        print('Screenshots: ' + str(REPORT))
        if cdp_url:
            print('LIMITATION: CSV button responses verified; Android download-manager file saving is not verified.')
    except Exception:
        record_status('failed')
        for context_index, ctx in enumerate(test_contexts):
            for page_index, failed_page in enumerate(ctx.pages):
                try:
                    failed_page.screenshot(path=str(REPORT / f'failure-{context_index}-{page_index}.png'), timeout=5000)
                except Exception:
                    pass
        raise
    finally:
        for ctx in test_contexts:
            ctx.close()
        browser.close()
