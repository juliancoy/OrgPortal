#!/usr/bin/env python3
"""Exercise real onboarding on the local Docker stack (no API fixtures).

Start with ORGPORTAL_LOCAL_TENANT_HOST=lifetech.fyi python run.py <prefix> <network>.
PIdP must use local log delivery so verification never sends external email.
"""
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
import uuid
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('PLAYWRIGHT_BASE_URL', 'https://localhost:8443').rstrip('/')
PIDP_CONTAINER = os.environ.get('ONBOARDING_PIDP_CONTAINER', 'bmoremedtech-pidp-dev')
ROOT = Path(__file__).resolve().parents[2] / '.local' / 'session-test'
assert urlparse(BASE).hostname in {'localhost', '127.0.0.1'}, 'Use a local Docker gateway'
ROOT.mkdir(parents=True, exist_ok=True)
ROOT.chmod(0o700)


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True, stderr=subprocess.PIPE)


def preflight():
    config = json.loads(docker('inspect', PIDP_CONTAINER))[0]
    env = dict(item.split('=', 1) for item in config['Config']['Env'] if '=' in item)
    assert config['State']['Running'], 'Local PIdP container is not running'
    assert BASE in env.get('ALLOWED_ORIGINS', '').split(','), (
        'PIdP does not trust the test gateway origin. Start the shared stack with OrgPortal/run.py.'
    )
    assert env.get('EMAIL_VERIFICATION_DELIVERY', 'log') == 'log', 'Use local verification log delivery'


def verification_link(email):
    # Treat the local delivery log as a test mailbox; never print its secret URLs.
    for _ in range(30):
        logs = subprocess.run(
            ['docker', 'logs', '--since', '5m', PIDP_CONTAINER],
            capture_output=True, text=True, check=True,
        )
        for candidate in re.findall(r'https?://[^\s]+', logs.stdout + logs.stderr):
            parsed = urlparse(candidate)
            if parsed.path.endswith('/auth/verify-email') and parse_qs(parsed.query).get('email') == [email]:
                assert parsed.hostname in {'localhost', '127.0.0.1'}, 'Verification must stay local'
                # PIdP runs behind the gateway's /pidp mount.
                return BASE + '/pidp/auth/verify-email?' + parsed.query
        time.sleep(.2)
    raise AssertionError('No verification message in the local PIdP delivery log')


preflight()
account = {'email': f'onboarding-{uuid.uuid4().hex}@example.com', 'password': secrets.token_urlsafe(32)}
with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE', '/usr/bin/google-chrome'),
        headless=True, args=['--no-sandbox'],
    )
    context = browser.new_context(ignore_https_errors=True, viewport={'width': 1280, 'height': 900}, timezone_id='America/New_York')
    context.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in {'localhost', '127.0.0.1'} else route.abort())
    page = context.new_page()
    try:
        for path in ('/pidp/health', '/api/org/health'):
            response = context.request.get(BASE + path, max_redirects=0)
            assert response.ok, f'Local service unavailable: {path} (HTTP {response.status})'
        tenant = context.request.get(BASE + '/api/org/api/portal/tenant', max_redirects=0).json()
        assert json.loads(tenant.get('feature_config') or '{}').get('onboarding', {}).get('enabled'), (
            'Select an onboarding-enabled local tenant with ORGPORTAL_LOCAL_TENANT_HOST=lifetech.fyi'
        )
        response = context.request.post(BASE + '/pidp/auth/register', data={**account, 'full_name': 'Local Onboarding Test'}, max_redirects=0)
        assert response.ok, f'Registration failed (HTTP {response.status})'
        response = context.request.get(verification_link(account['email']), max_redirects=0)
        assert response.status == 303 and 'error=' not in response.headers.get('location', ''), 'Email verification failed'
        response = context.request.post(BASE + '/pidp/auth/session/login', form={'username': account['email'], 'password': account['password']}, headers={'Origin': BASE}, max_redirects=0)
        assert response.ok, f'Local cookie login failed (HTTP {response.status}): {response.text()}'
        print('PASS: registration, email verification, and local cookie login', flush=True)
        page.goto(BASE + '/people')
        page.get_by_role('link', name='Continue onboarding').click(timeout=30000)
        expect(page.get_by_role('heading', name=tenant['name'] + ' onboarding', exact=True)).to_be_visible(timeout=30000)
        save = page.get_by_role('button', name='Save month availability')
        expect(save).to_be_disabled()
        expect(page.locator('.onboarding-steps li')).to_have_count(4)
        page.screenshot(path=str(ROOT / 'onboarding-desktop.png'), full_page=True)
        for step in page.locator('.onboarding-steps li').all():
            step.get_by_role('button', name='I have completed this step').click()
            expect(step.get_by_text('✓ Confirmed', exact=True)).to_be_visible()
        # Select a real half-hour, review every week, and save through the UI.
        slot = page.locator('tbody td button').first
        slot_label = slot.get_attribute('aria-label').split(',')[0]
        slot.click()
        expect(slot).to_have_attribute('aria-pressed', 'true')
        next_week = page.get_by_role('button', name='Next week')
        while next_week.is_enabled():
            next_week.click()
        expect(save).to_be_disabled()
        page.get_by_role('checkbox', name='I reviewed the whole month').check()
        save.click()
        expect(page.get_by_text('Onboarding complete', exact=True)).to_be_visible(timeout=15000)
        page.reload()
        expect(page.get_by_text('Onboarding complete', exact=True)).to_be_visible(timeout=15000)
        expect(page.get_by_role('button', name=slot_label + ', available,', exact=False)).to_have_attribute('aria-pressed', 'true')
        expect(page.get_by_role('link', name='Continue onboarding')).to_have_count(0)
        print('PASS: all required steps, month review, selected availability, and completion persist after reload', flush=True)
        page.set_viewport_size({'width': 390, 'height': 844})
        page.screenshot(path=str(ROOT / 'onboarding-mobile.png'), full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Page overflows at mobile width'
        print('PASS: mobile layout without page overflow', flush=True)
    except Exception:
        page.screenshot(path=str(ROOT / 'onboarding-failure.png'), full_page=True)
        raise
    finally:
        browser.close()
