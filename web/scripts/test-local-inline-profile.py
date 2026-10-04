#!/usr/bin/env python3
"""Exercise independent inline profile edits against the local Docker stack."""
import json
import os
import secrets
import uuid
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from local_browser_test_support import BASE, preflight, verification_link

preflight()
account = {'email': f'inline-profile-{uuid.uuid4().hex}@example.com', 'password': secrets.token_urlsafe(32)}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE', '/usr/bin/google-chrome'), headless=True, args=['--no-sandbox'])
    context = browser.new_context(ignore_https_errors=True, viewport={'width': 1280, 'height': 900})
    context.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in {'localhost', '127.0.0.1'} else route.abort())
    page = context.new_page()
    try:
        for path in ['/pidp/health', '/api/org/health']:
            assert context.request.get(BASE + path).ok, f'Local service unavailable: {path}'
        assert context.request.post(BASE + '/pidp/auth/register', data={**account, 'full_name': 'Inline Profile Test'}).ok
        assert context.request.get(verification_link(account['email']), max_redirects=0).status == 303
        login = context.request.post(BASE + '/pidp/auth/session/login', form={'username': account['email'], 'password': account['password']}, headers={'Origin': BASE})
        assert login.ok, 'Local login failed'
        session = context.request.get(BASE + '/pidp/auth/session-token')
        assert session.ok, 'Local session unavailable'
        auth = {'Authorization': 'Bearer ' + session.json()['access_token']}
        assert context.request.put(BASE + '/api/org/api/network/contact/me', headers=auth, data={'headline': 'Original headline', 'bio': 'Original bio', 'enabled': True}).ok
        photo = BASE + '/assets/images/lifetech-logo.png'
        assert context.request.put(BASE + '/pidp/auth/me', headers=auth, data={'avatar_url': photo}).ok
        assert context.request.put(BASE + '/api/org/api/network/contact/me', headers=auth, data={'photo_url': photo}).ok
        page.goto(BASE + '/profile')
        expect(page.get_by_role('button', name='Edit name', exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_role('button', name='Edit page', exact=True)).to_have_count(0)
        page.get_by_role('button', name='Edit bio', exact=True).click()
        page.get_by_label('Bio', exact=True).fill('Unsaved independent bio')
        page.get_by_role('button', name='Edit headline', exact=True).click()
        page.get_by_label('Headline', exact=True).fill('Saved headline')
        with page.expect_response(lambda response: response.url.endswith('/api/network/contact/me') and response.request.method == 'PUT') as saved:
            page.get_by_role('button', name='Save headline', exact=True).click()
        assert saved.value.ok
        assert saved.value.request.post_data_json == {'headline': 'Saved headline'}, 'Saving sent unrelated fields'
        expect(page.get_by_label('Bio', exact=True)).to_have_value('Unsaved independent bio')
        page.reload()
        expect(page.get_by_text('Saved headline', exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_text('Original bio', exact=True)).to_be_visible()
        page.get_by_role('button', name='Edit name', exact=True).click()
        page.get_by_label('Name', exact=True).fill('Updated Inline Name')
        with page.expect_response(lambda response: response.url.endswith('/pidp/auth/me') and response.request.method == 'PUT') as name_saved:
            page.get_by_role('button', name='Save name', exact=True).click()
        assert name_saved.value.ok
        assert set(name_saved.value.request.post_data_json) == {'full_name', 'display_name', 'first_name', 'last_name'}
        expect(page.get_by_role('heading', name='Updated Inline Name', exact=True)).to_be_visible()
        page.get_by_role('button', name='Edit headline', exact=True).click()
        page.get_by_label('Headline', exact=True).fill('Cancelled headline')
        page.get_by_role('button', name='Cancel', exact=True).click()
        expect(page.get_by_text('Saved headline', exact=True)).to_be_visible()
        page.get_by_role('button', name='Edit headline', exact=True).click()
        page.get_by_label('Headline', exact=True).fill('Rejected headline')
        def reject(route):
            if route.request.method == 'PUT': route.fulfill(status=422, content_type='application/json', body=json.dumps({'detail': 'Test rejected save'}))
            else: route.continue_()
        page.route('**/api/network/contact/me', reject)
        page.get_by_role('button', name='Save headline', exact=True).click()
        expect(page.get_by_role('alert')).to_have_text('Test rejected save')
        expect(page.get_by_label('Headline', exact=True)).to_have_value('Rejected headline')
        page.unroute('**/api/network/contact/me', reject)
        page.get_by_role('button', name='Save headline', exact=True).click()
        expect(page.get_by_text('Rejected headline', exact=True)).to_be_visible()
        page.reload()
        expect(page.get_by_role('heading', name='Updated Inline Name', exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_text('Original bio', exact=True)).to_be_visible()
        page.get_by_role('button', name='Edit city', exact=True).click()
        page.get_by_label('City', exact=True).fill('Baltimore')
        with page.expect_response(lambda response: response.url.endswith('/pidp/auth/me') and response.request.method == 'PUT') as city_saved:
            page.get_by_role('button', name='Save city', exact=True).click()
        assert city_saved.value.ok
        assert city_saved.value.request.post_data_json == {'city': 'Baltimore'}
        expect(page.get_by_text('City: Baltimore', exact=True)).to_be_visible()
        with page.expect_response(lambda response: response.url.endswith('/pidp/auth/me') and response.request.method == 'PUT') as photo_saved:
            page.get_by_role('button', name='Remove', exact=True).click()
        assert photo_saved.value.ok
        assert photo_saved.value.request.post_data_json == {'avatar_url': None}, 'Photo update sent unrelated fields'
        expect(page.get_by_text('Photo saved.', exact=True)).to_be_visible()
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile page overflows'
        slug = context.request.get(BASE + '/api/org/api/network/contact/me', headers=auth).json()['slug']
        visitor = browser.new_context(ignore_https_errors=True)
        visitor.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in {'localhost', '127.0.0.1'} else route.abort())
        page = visitor.new_page()
        page.goto(BASE + '/users/' + slug)
        expect(page.get_by_role('heading', name='Updated Inline Name', exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_role('button', name='Edit name', exact=True)).to_have_count(0)
        print('PASS: independent field payloads, draft isolation, cancel, failed-save retry, persisted name, mobile layout, and visitor read-only profile')
    finally:
        browser.close()
