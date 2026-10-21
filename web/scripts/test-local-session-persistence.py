#!/usr/bin/env python3
"""Exercise real local Docker sessions across browser and service lifetimes."""

import json
import importlib.util
import os
from pathlib import Path
import secrets
import re
import sys
import time
from urllib.parse import urlparse, parse_qs

import docker
from playwright.sync_api import sync_playwright, expect


BASE = 'https://localhost:8443'
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from service_names import service_name
PREFIX = os.getenv('ORGPORTAL_SESSION_TEST_PREFIX', 'session-test-')
NETWORK = os.getenv('ORGPORTAL_SESSION_TEST_NETWORK', 'orgportal-session-test')
PORTAL = service_name(PREFIX, 'portal-dev')
IDENTITY = service_name(PREFIX, 'pidp-dev')
GATEWAY = service_name(PREFIX, 'local-gateway')
ROOT = Path(__file__).resolve().parents[2] / '.local' / 'session-test'
ROOT.mkdir(parents=True, exist_ok=True)
ROOT.chmod(0o700)
ACCOUNT = ROOT / 'account.json'
if not ACCOUNT.exists():
    ACCOUNT.write_text(json.dumps({
        'email': 'session-persistence@example.com',
        'password': secrets.token_urlsafe(32),
    }))
ACCOUNT.chmod(0o600)
account = json.loads(ACCOUNT.read_text())
client = docker.from_env()

# Verify the local deployment before registering a synthetic account. Verification
# email must stay in the local log; use the normal verification route below.
spec = importlib.util.spec_from_file_location('session_test_local_login', ROOT.parents[1] / 'scripts/local-login.py')
local_login = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local_login)
local_login.preflight(IDENTITY, BASE)
assert account['email'] == 'session-persistence@example.com'
delivery_check = client.containers.get(IDENTITY).exec_run([
    '/venv/bin/python', '-c', '''import asyncio
from main import _stored_email_delivery_settings
from db import SessionLocal, engine
async def check():
    try:
        async with SessionLocal() as db:
            assert (await _stored_email_delivery_settings(db))['delivery'] == 'log'
    finally:
        await engine.dispose()
asyncio.run(check())'''
], workdir='/app')
assert delivery_check.exit_code == 0, 'Session fixtures require local log email delivery'


def redeploy(name):
    """Recreate only our test container, preserving its mounts and environment."""
    assert name in {PORTAL, IDENTITY}
    container = client.containers.get(name)
    config = container.attrs['Config']
    host_config = container.attrs['HostConfig']
    assert host_config['NetworkMode'] == NETWORK
    endpoints = {
        network: client.api.create_endpoint_config(aliases=list(dict.fromkeys([
            name, *[alias for alias in endpoint.get('Aliases') or []
                    if alias not in {container.id, container.short_id}]
        ])))
        for network, endpoint in container.attrs['NetworkSettings']['Networks'].items()
    }
    container.stop(timeout=10)
    container.remove()
    created = client.api.create_container(
        image=config['Image'], name=name, command=config['Cmd'],
        environment=config['Env'], working_dir=config['WorkingDir'],
        volumes=config.get('Volumes'), host_config=host_config,
        networking_config=client.api.create_networking_config(endpoints),
    )
    client.api.start(created['Id'])


def browser(p):
    context = p.chromium.launch_persistent_context(
        str(ROOT / 'chrome-profile'), executable_path='/usr/bin/google-chrome',
        headless=True, ignore_https_errors=True, args=['--no-sandbox'],
    )
    # No browser request, including redirects, may reach a public service.
    context.route('**/*', lambda route: route.continue_()
                  if urlparse(route.request.url).hostname in {'localhost', '127.0.0.1'}
                  else route.abort())
    return context


def wait_ready(context, path):
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        try:
            if context.request.get(BASE + path, timeout=3000).ok:
                return
        except Exception:
            pass
        time.sleep(1)
    raise AssertionError('Local service did not become ready: ' + path)


def assert_session(context, expected_id):
    response = context.request.get(BASE + '/pidp/auth/session-token')
    assert response.ok, 'Session cookie no longer accepted'
    token = response.json()['access_token']
    identity = context.request.get(BASE + '/pidp/auth/me', headers={
        'Authorization': 'Bearer ' + token,
    })
    assert identity.ok and identity.json()['id'] == expected_id, 'Session identity changed'
    page = context.new_page()
    page.goto(BASE + '/people', wait_until='domcontentloaded')
    try:
        expect(page.get_by_role('button', name='Open user menu')).to_be_visible(timeout=30000)
    except Exception:
        page.screenshot(path=str(ROOT / 'failure.png'), full_page=True)
        print('Failed portal page:', page.url, flush=True)
        print('Page text:', page.locator('body').inner_text()[:800], flush=True)
        raise
    page.close()


with sync_playwright() as p:
    context = browser(p)
    wait_ready(context, '/pidp/health')
    wait_ready(context, '/users/login')
    registration = context.request.post(BASE + '/pidp/auth/register', data={
        **account, 'full_name': 'Local Session Test',
    })
    assert registration.status in {200, 201, 409}, ('Local registration failed', registration.status)
    if registration.status in {200, 201}:
        denied = context.request.post(BASE + '/pidp/auth/session/login', form={
            'username': account['email'], 'password': account['password'],
        }, headers={'Origin': BASE})
        assert denied.status == 403, 'Fresh fixture must require email verification'
        logs = client.containers.get(IDENTITY).logs(tail=200).decode('utf-8', errors='replace')
        links = re.findall(re.escape(BASE) + r'/pidp/auth/verify-email\?\S+', logs)
        links = [link for link in links if parse_qs(urlparse(link).query).get('email') == [account['email']]]
        assert links, 'Local verification email was not logged'
        verified = context.request.get(links[-1], max_redirects=0)
        assert verified.status == 303 and 'error' not in parse_qs(urlparse(verified.headers['location']).query), 'Local email verification failed'
        print('PASS: unverified login rejected and local email verification completed', flush=True)
    login = context.request.post(BASE + '/pidp/auth/session/login', form={
        'username': account['email'], 'password': account['password'],
    }, headers={'Origin': BASE})
    assert login.ok, ('Local cookie login failed', login.status)
    token = context.request.get(BASE + '/pidp/auth/session-token').json()['access_token']
    identity = context.request.get(BASE + '/pidp/auth/me', headers={'Authorization': 'Bearer ' + token}).json()['id']
    assert_session(context, identity)
    print('PASS: local login and authenticated portal', flush=True)
    context.close()

    context = browser(p)
    assert_session(context, identity)
    print('PASS: session persists across a fresh browser run', flush=True)
    context.close()

    redeploy(PORTAL)
    redeploy(IDENTITY)
    # The gateway must re-resolve the recreated containers, whose IPs can change.
    client.containers.get(GATEWAY).restart(timeout=10)
    context = browser(p)
    wait_ready(context, '/pidp/health')
    wait_ready(context, '/users/login')
    assert_session(context, identity)
    print('PASS: session persists after portal and identity container redeployment', flush=True)

    logout = context.request.post(BASE + '/pidp/auth/session/logout', headers={'Origin': BASE})
    assert logout.ok, ('Logout failed', logout.status)
    context.close()
    context = browser(p)
    assert context.request.get(BASE + '/pidp/auth/session-token').status == 401
    print('PASS: logout persists across a fresh browser run', flush=True)
    context.close()
