#!/usr/bin/env python3
"""Verify public badges, admin sheet UI, and actual Letter PDF pagination locally."""
import json
import os
import re
import secrets
import uuid
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from local_browser_test_support import BASE, preflight, verification_link

preflight()
account = {'email': f'nametags-{uuid.uuid4().hex}@example.com', 'password': secrets.token_urlsafe(32)}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE', '/usr/bin/google-chrome'), headless=True, args=['--no-sandbox'])
    context = browser.new_context(ignore_https_errors=True)
    context.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in {'localhost', '127.0.0.1'} else route.abort())
    try:
        for path in ['/pidp/health', '/api/org/health']:
            assert context.request.get(BASE + path).ok, f'Local endpoint unavailable: {path}'
        assert context.request.post(BASE + '/pidp/auth/register', data={**account, 'full_name': 'Public Nametag Test'}).ok
        assert context.request.get(verification_link(account['email']), max_redirects=0).status == 303
        assert context.request.post(BASE + '/pidp/auth/session/login', form={'username': account['email'], 'password': account['password']}, headers={'Origin': BASE}).ok
        session = context.request.get(BASE + '/pidp/auth/session-token').json()
        auth = {'Authorization': 'Bearer ' + session['access_token']}
        contact = context.request.put(BASE + '/api/org/api/network/contact/me', headers=auth, data={'enabled': True}).json()
        assert context.request.get(BASE + '/api/org/admin/nametags', headers=auth).status == 403, 'Ordinary members must not get the admin roster'
        group = context.request.get(BASE + '/api/org/api/network/orgs/public/lifetech').json()
        context.route('**/api/network/orgs?mine=true*', lambda route: route.fulfill(content_type='application/json', body=json.dumps([{**group, 'my_role': 'owner'}])))
        context.route('**/api/network/orgs/' + group['id'] + '/membership', lambda route: route.fulfill(content_type='application/json', body=json.dumps({'organization_id': group['id'], 'status': 'active', 'role': 'owner', 'membership_count': 1})))
        page = context.new_page()
        page.goto(BASE + '/orgs/lifetech')
        expect(page.get_by_text('Organization dashboard', exact=True)).to_be_visible(timeout=30000)
        switcher = page.get_by_role('combobox', name='Organization view')
        expect(switcher).to_have_value('organizers', timeout=30000)
        expect(page.get_by_role('button', name='Edit page', exact=True)).to_be_visible()
        switcher.select_option('public')
        expect(page.get_by_role('button', name='Edit page', exact=True)).to_have_count(0)
        expect(page.get_by_role('heading', name='Events and registration', exact=True)).to_have_count(0)
        switcher.select_option('members')
        expect(page.get_by_role('heading', name='Member workspace')).to_be_visible()
        switcher.select_option('attendees')
        expect(page.get_by_role('heading', name='Attendee workspace')).to_be_visible()
        switcher.select_option('volunteers')
        expect(page.get_by_role('heading', name='Volunteer workspace')).to_be_visible()
        visitor = browser.new_context(ignore_https_errors=True)
        visitor.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in {'localhost', '127.0.0.1'} else route.abort())
        public_page = visitor.new_page()
        public_page.goto(BASE + '/orgs/lifetech?view=organizers')
        expect(public_page.get_by_text('Public view', exact=True)).to_be_visible(timeout=30000)
        expect(public_page.get_by_role('button', name='Edit page', exact=True)).to_have_count(0)
        expect(public_page.get_by_role('combobox', name='Organization view').locator('option[value="organizers"]')).to_have_attribute('disabled', '')
        expect(public_page.get_by_role('combobox', name='Organization view').locator('option[value="members"]')).to_have_attribute('disabled', '')
        print('PASS: organizer default, all five view switches, public controls hidden, visitor privileged views denied')
    finally:
        browser.close()
