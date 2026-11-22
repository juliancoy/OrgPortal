"""Check website/portal Home navigation with synthetic sessions and local assets only."""
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT.parent / 'TechParty'
PORTAL = 'https://localhost:19458'
OUTPUT = ROOT / 'artifacts/layout-review/techparty-home'
OUTPUT.mkdir(parents=True, exist_ok=True)
tenant = {
    'id': 'tech-party', 'hostname': 'techparty.us', 'name': 'Tech Party',
    'profile': 'community', 'tagline': 'Industry, education, work, and housing',
    'features': ['directory', 'events', 'chat'], 'canonical_path_prefix': '',
    'home_url': 'https://techparty.us/', 'home_org_slug': 'tech-party',
    'brand_image_path': '/images/tech-party-light.svg',
}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    try:
        for host in ['techparty.us', 'www.techparty.us']:
            for signed_in in [False, True]:
                for width in [320, 390, 1440]:
                    origin = 'https://' + host
                    context = browser.new_context(ignore_https_errors=True, viewport={'width': width, 'height': 1000})
                    errors = []
                    documents = []

                    def route_request(route):
                        request = route.request
                        url = urlparse(request.url)
                        if url.hostname != host:
                            return route.abort()
                        if request.method != 'GET':
                            return route.fulfill(status=405, body='Read-only fixture')
                        path = url.path
                        if path.startswith('/pidp/'):
                            if not signed_in:
                                return route.fulfill(status=401, json={})
                            if path.endswith('/auth/session-token'):
                                return route.fulfill(json={'access_token': 'header.payload.signature'})
                            if path.endswith('/auth/me'):
                                return route.fulfill(json={'id': 'synthetic-member', 'email': 'member@example.test', 'full_name': 'Synthetic Member', 'identity_data': {'avatar_url': origin + '/images/tech-party-light.svg'}})
                            return route.fulfill(status=401, json={})
                        if path.startswith('/api/'):
                            if path.endswith('/portal/site'):
                                return route.fulfill(json=tenant)
                            if path.endswith('/admin/me'):
                                return route.fulfill(json={'is_sysadmin': False})
                            return route.fulfill(json=[])
                        if request.is_navigation_request():
                            documents.append(path)
                        asset = (SITE / ('index.html' if path == '/' else path.lstrip('/'))).resolve()
                        if asset.is_relative_to(SITE) and asset.is_file():
                            return route.fulfill(body=asset.read_bytes(), content_type=mimetypes.guess_type(asset.name)[0] or 'application/octet-stream')
                        # All portal code comes from the existing isolated Docker deployment.
                        response = context.request.get(PORTAL + path + ('?' + url.query if url.query else ''))
                        return route.fulfill(response=response)

                    context.route('**/*', route_request)
                    page = context.new_page()
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(origin + '/communities', wait_until='networkidle')
                    expect(page.locator('.portal-brand')).to_be_visible()
                    if signed_in:
                        expect(page.locator('.portal-user-trigger')).to_be_visible()
                    page.locator('.portal-brand').click()
                    expect(page.locator('#hero-title')).to_have_text('The Tech Party')
                    account = page.locator('#portal-login-button')
                    expect(account).to_have_attribute('data-portal-authenticated', str(signed_in).lower())
                    if signed_in:
                        expect(account).to_have_attribute('href', '/users/account')
                        expect(account).to_contain_text('Synthetic Member')
                        expect(account.locator('img')).to_be_visible()
                        page.evaluate("location.hash = 'account-check'")
                        expect(account).to_have_attribute('href', '/users/account')
                    assert documents == ['/communities', '/'], documents
                    expect(page.locator('#platform-title')).to_have_count(0)
                    page.evaluate('document.fonts.ready')
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    page.screenshot(path=str(OUTPUT / f'{host}-{width}-{"member" if signed_in else "guest"}.png'), full_page=True)
                    page.reload(wait_until='domcontentloaded')
                    expect(page.locator('#hero-title')).to_be_visible()
                    expect(account).to_have_attribute('data-portal-authenticated', str(signed_in).lower())
                    # Account UI refreshes after returning from another tab.
                    signed_in = not signed_in
                    page.evaluate("window.dispatchEvent(new Event('focus'))")
                    expect(account).to_have_attribute('data-portal-authenticated', str(signed_in).lower())
                    signed_in = not signed_in
                    page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))")
                    expect(account).to_have_attribute('data-portal-authenticated', str(signed_in).lower())
                    # Other SPA callers of / must also leave the portal router.
                    page.goto(origin + '/communities', wait_until='networkidle')
                    expect(page.locator('.portal-brand')).to_be_visible()
                    before = documents.count('/')
                    page.evaluate("history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate'))")
                    expect(page.locator('#hero-title')).to_be_visible()
                    assert documents.count('/') == before + 1, documents
                    # Auth state remains available when returning to portal pages.
                    page.goto(origin + '/communities', wait_until='networkidle')
                    expect(page.locator('.portal-brand')).to_be_visible()
                    if signed_in:
                        expect(page.locator('.portal-user-trigger')).to_be_visible()
                    assert not errors, errors
                    context.close()
                    print(f'PASS {host} {width}px {"member" if signed_in else "guest"}: Home document, reload, SPA fallback, portal return', flush=True)
    finally:
        browser.close()
