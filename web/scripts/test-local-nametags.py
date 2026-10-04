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
        visitor = browser.new_context(ignore_https_errors=True)
        visitor.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in {'localhost', '127.0.0.1'} else route.abort())
        public_page = visitor.new_page()
        public_page.goto(BASE + '/users/' + contact['slug'])
        expect(public_page.get_by_role('heading', name='Conference nametag')).to_be_visible(timeout=30000)
        expect(public_page.get_by_role('button', name='Print nametag', exact=True)).to_be_enabled()
        assert public_page.locator('.conference-nametag-qr').get_attribute('src').startswith('data:image/svg+xml')
        expect(public_page.get_by_role('button', name='Edit name', exact=True)).to_have_count(0)
        # Isolate admin UI fixtures locally; real API authorization is asserted above and in SQL tests.
        people = [{'user_id': str(n), 'name': f'Person {n}', 'slug': f'person-{n}', 'avatar_url': '', 'public': True} for n in range(7)]
        context.route('**/admin/me', lambda route: route.fulfill(content_type='application/json', body=json.dumps({'is_sysadmin': True})))
        context.route('**/admin/nametags?*', lambda route: route.fulfill(content_type='application/json', body=json.dumps({'people': people, 'next_cursor': None})))
        page = context.new_page()
        page.goto(BASE + '/admin/nametags')
        expect(page.get_by_role('button', name='Print all nametags')).to_be_enabled(timeout=30000)
        expect(page.locator('.nametag-letter-sheet')).to_have_count(2)
        assert page.locator('.nametag-letter-sheet').first.locator('.conference-nametag').count() == 6
        assert page.locator('.nametag-letter-sheet').last.locator('.conference-nametag').count() == 1
        dimensions = page.locator('.conference-nametag').first.bounding_box()
        assert dimensions['width'] == 384 and dimensions['height'] == 288, dimensions
        page.evaluate('''() => {
          new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) {
              if (node.tagName === 'IFRAME') node.contentWindow.print = () => {
                window.printedNametags = node.contentDocument.documentElement.outerHTML;
              };
            }
          }).observe(document.body, {childList: true});
        }''')
        page.get_by_role('button', name='Print all nametags').click()
        page.wait_for_function('window.printedNametags')
        print_html = page.evaluate('window.printedNametags')
        assert 'nametags-controls' not in re.search(r'<body>(.*)</body>', print_html, re.S).group(1)
        print_page = context.new_page()
        print_page.set_content(print_html)
        pdf = print_page.pdf(prefer_css_page_size=True, print_background=True)
        assert len(re.findall(rb'/Type /Page\b', pdf)) == 2, 'Expected exactly two printable sheets'
        assert b'612 792' in pdf, 'Expected Letter paper (8.5 by 11 inches)'
        print('PASS: public badge and QR, member denied roster, six badges per sheet, 4x3 dimensions, print isolation, and two Letter PDF pages')
    finally:
        browser.close()
