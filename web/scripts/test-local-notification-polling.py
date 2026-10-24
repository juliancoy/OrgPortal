#!/usr/bin/env python3
"""Notification polling and diagnostics against the isolated local Docker stack."""
from contextlib import ExitStack
import json
import os
import secrets
import subprocess
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('PLAYWRIGHT_BASE_URL', 'https://localhost:19458').rstrip('/')
CONTAINER = os.environ.get('ONBOARDING_PIDP_CONTAINER', 'common-form-test-identity-api')
assert urlparse(BASE).hostname in {'localhost', '127.0.0.1'}
assert 'test-' in CONTAINER, 'Use an isolated fixture identity container'
config = json.loads(subprocess.check_output(['docker', 'inspect', CONTAINER], text=True))[0]
env = dict(item.split('=', 1) for item in config['Config']['Env'] if '=' in item)
assert env.get('EMAIL_VERIFICATION_DELIVERY', 'log') == 'log'
assert BASE in env.get('ALLOWED_ORIGINS', '').split(',')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
    context = browser.new_context(ignore_https_errors=True)
    context.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in {'localhost', '127.0.0.1'} else route.abort())
    try:
        assert context.request.get(BASE + '/api/org/api/network/replication/status').json()['mode'] == 'primary'
        email = 'notification-polling-' + uuid.uuid4().hex + '@example.com'
        password = secrets.token_urlsafe(24)
        created = context.request.post(BASE + '/pidp/auth/register', data={'email': email, 'password': password})
        assert created.ok, f'Local registration: {created.status}'
        # Fixture setup only: no real email, production DB, or account changes.
        setup = '''import asyncio,json,sys
from sqlalchemy import select
from db import SessionLocal
from models import User
email=json.load(sys.stdin)['email']
assert email.startswith('notification-polling-') and email.endswith('@example.com')
async def main():
 async with SessionLocal() as session:
  user=(await session.execute(select(User).where(User.email==email))).scalar_one()
  user.identity_data={**(user.identity_data or {}),'email_verified':True}
  await session.commit()
asyncio.run(main())
'''
        result = subprocess.run(['docker', 'exec', '-i', '-w', '/tmp', '-e', 'PYTHONPATH=/app', CONTAINER, '/venv/bin/python', '-c', setup], input=json.dumps({'email': email}), text=True, capture_output=True)
        assert result.returncode == 0, 'Local identity fixture setup failed'
        login = context.request.post(BASE + '/pidp/auth/session/login', form={'username': email, 'password': password}, headers={'Origin': BASE})
        assert login.ok, f'Local login: {login.status}'
        page = context.new_page()
        page.add_init_script('''window.__pollVisible = 'visible'; window.__pollOnline = true;
Object.defineProperty(document, 'visibilityState', {get: () => window.__pollVisible});
Object.defineProperty(navigator, 'onLine', {get: () => window.__pollOnline});''')
        now = datetime.now(timezone.utc)
        page.clock.install(time=now)
        page.clock.pause_at(now + timedelta(seconds=1))
        calls = []
        timings = []
        statuses = []
        paths = ['/api/network/notifications/summary', '/api/network/notifications', '/api/network/connections/requests']
        def tracked(request):
            path = urlparse(request.url).path.removeprefix('/api/org')
            if path in paths:
                calls.append(path)
        page.on('request', tracked)
        def response_seen(response):
            path = urlparse(response.url).path.removeprefix('/api/org')
            if path in paths:
                statuses.append(response.status)
                timings.append(response.headers.get('server-timing', ''))
        page.on('response', response_seen)
        def wait_for_notifications(action, expected):
            with ExitStack() as stack:
                for path in expected:
                    stack.enter_context(page.expect_response(lambda response, path=path: urlparse(response.url).path.removeprefix('/api/org') == path))
                action()

        page.goto(BASE + '/communities', wait_until='networkidle')
        trigger = page.get_by_role('button', name='Notifications', exact=False)
        expect(trigger).to_be_visible(timeout=30000)
        assert calls.count(paths[0]) >= 1
        assert paths[1] not in calls and paths[2] not in calls, 'Closed menu fetched notification lists'
        calls.clear()
        wait_for_notifications(lambda: page.clock.run_for(60_100), [paths[0]])
        assert calls == [paths[0]], f'Expected one summary per minute: {calls}'
        calls.clear()
        page.evaluate("window.__pollVisible='hidden';document.dispatchEvent(new Event('visibilitychange'))")
        page.clock.run_for(180_000)
        assert calls == [], f'Hidden tab polled: {calls}'
        wait_for_notifications(lambda: page.evaluate("window.__pollVisible='visible';document.dispatchEvent(new Event('visibilitychange'))"), [paths[0]])
        assert calls == [paths[0]], f'Return did not refresh summary once: {calls}'
        calls.clear()
        page.evaluate("window.__pollOnline=false;window.dispatchEvent(new Event('offline'))")
        page.clock.run_for(180_000)
        assert calls == [], f'Offline page polled: {calls}'
        wait_for_notifications(lambda: page.evaluate("window.__pollOnline=true;window.dispatchEvent(new Event('online'))"), [paths[0]])
        assert calls == [paths[0]]
        calls.clear()
        wait_for_notifications(lambda: trigger.click(), paths)
        expect(page.get_by_role('dialog', name='Notifications')).to_be_visible()
        assert sorted(calls) == sorted(paths), f'Opening did not load the notification lists: {calls}'
        calls.clear()
        wait_for_notifications(lambda: page.get_by_role('dialog', name='Notifications').get_by_role('button', name='Refresh', exact=True).click(), paths)
        assert sorted(calls) == sorted(paths), f'Manual refresh failed: {calls}'
        calls.clear()
        trigger.click()
        page.wait_for_load_state('networkidle')
        assert not calls, 'Closing menu fetched notifications'
        assert any('rows_read=' in timing and 'queries=' in timing for timing in timings), 'Database diagnostics missing'
        assert statuses and all(status == 200 for status in statuses), f'Notification response errors: {statuses}'
        assert all('unmeasured=' in timing for timing in timings), 'Unavailable database measurements were not labelled'
        page.get_by_role('button', name='Open user menu').click()
        page.get_by_role('menuitem', name='Sign out', exact=True).click()
        expect(trigger).not_to_be_visible()
        page.wait_for_load_state('networkidle')
        calls.clear()
        page.clock.run_for(120_000)
        assert not calls, 'Signed-out page continued polling notifications'
        print('PASS: summary-only minute polling, hidden/offline suspension, resume, menu and manual refresh, database timings, sign-out cleanup')
    finally:
        context.close()
        browser.close()
