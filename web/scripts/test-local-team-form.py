#!/usr/bin/env python3
"""Real presentation-form clickthrough against an isolated local Docker deployment.

PLAYWRIGHT_BASE_URL=https://localhost:9457 \
ONBOARDING_PIDP_CONTAINER=team-form-test-identity-api \
python3 web/scripts/test-local-team-form.py

Uses synthetic accounts, a dummy host organization/event, and a dummy applicant
team. All requests stay on loopback; remote organization replication must be off.
"""
import json
import os
import secrets
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
        group = successful(host.request.post(BASE + '/api/org/api/network/orgs', headers=auth, data={'name': f'Dummy Demo Host {run_id}', 'city': 'Baltimore', 'kind': 'organization', 'description': 'Synthetic local clickthrough fixture.', 'acknowledgeOwnership': True}))
        event = successful(host.request.post(BASE + '/api/org/api/network/events', headers=auth, data={'title': f'Dummy Demo Day {run_id}', 'host_type': 'org', 'host_org_id': group['id'], 'ingest_key': f'local-team-form-{run_id}', 'starts_at': '2099-11-17T23:00:00Z', 'ends_at': '2099-11-18T01:30:00Z', 'location': 'Local test venue', 'description': '## What to expect\n\n- A local demonstration.\n- A team presentation.'}))
        endpoint = BASE + '/api/org/api/network/events/' + event['id'] + '/presentations'
        successful(host.request.put(endpoint + '/form', headers=auth, data={'enabled': True}))
        applicant = context()
        credentials = account(applicant, 'applicant')
        page = applicant.new_page()
        page.goto(BASE + '/events/' + event['slug'])
        section = page.get_by_role('region', name='Presentation applications', exact=True)
        section.get_by_role('link', name='Sign in', exact=True).click()
        email_choice = page.get_by_role('link', name='Continue with email', exact=True)
        if email_choice.is_visible():
            email_choice.click()
        page.locator('#login-email').fill(credentials['email'])
        page.locator('#login-password').fill(credentials['password'])
        page.get_by_role('button', name='Sign in', exact=True).click()
        form = page.get_by_role('form', name='Team presentation application')
        expect(form).to_be_visible(timeout=30000)
        expect(page.get_by_role('heading', name='What to expect', exact=True)).to_be_visible()
        expect(page.locator('.bio-markdown li')).to_have_count(2)
        form.get_by_label('Team name', exact=True).fill(f'Dummy Demo Team {run_id}')
        form.get_by_label('City', exact=True).fill('Baltimore')
        form.get_by_label('About your team', exact=True).fill('A dummy organization for a local browser test.')
        form.get_by_label('Presentation title', exact=True).fill('A local demo')
        form.get_by_label('What will you present?', exact=True).fill('A synthetic demo to verify the submission flow.')
        submit = form.get_by_role('button', name='Submit application', exact=True)
        # Native form validation must prevent submission without ownership consent.
        await_response = []
        page.on('request', lambda request: await_response.append(request.url) if request.method == 'PUT' and '/presentations/' in request.url else None)
        submit.click()
        assert not form.evaluate('(form) => form.checkValidity()')
        assert not await_response
        form.get_by_role('checkbox').check()
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
        submit.click()
        expect(section.get_by_role('status')).to_have_text('Application submitted to the event organizers.', timeout=30000)
        expect(section.get_by_role('heading', name=f'Dummy Demo Team {run_id}: A local demo')).to_be_visible(timeout=30000)
        page.reload()
        expect(section.get_by_role('heading', name=f'Dummy Demo Team {run_id}: A local demo')).to_be_visible(timeout=30000)
        saved = successful(host.request.get(endpoint, headers=auth))['submissions']
        assert len(saved) == 1 and saved[0]['title'] == 'A local demo'
        team_id = saved[0]['organization_id']
        applicant_token = successful(applicant.request.get(BASE + '/pidp/auth/session-token'))['access_token']
        membership = successful(applicant.request.get(BASE + '/api/org/api/network/orgs/' + team_id + '/membership', headers={'Authorization': 'Bearer ' + applicant_token}))
        assert membership['role'] == 'owner' and membership['status'] == 'active'
        section.get_by_role('button', name='Withdraw application', exact=True).click()
        expect(section.get_by_role('button', name='Withdraw application', exact=True)).to_have_count(0, timeout=30000)
        assert successful(host.request.get(endpoint, headers=auth))['submissions'] == []
        print('PASS: local sign-in → dummy team creation → ownership validation → styled desktop/mobile form → submit → persisted application → withdraw; Markdown and global button fallback verified')
        print('Screenshots: ' + str(REPORT))
    finally:
        browser.close()
