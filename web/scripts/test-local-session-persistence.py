#!/usr/bin/env python3
"""Exercise real local Docker sessions across browser and service lifetimes."""

import json
from pathlib import Path
import secrets
import time
from urllib.parse import urlparse

import docker
from playwright.sync_api import sync_playwright, expect


BASE = 'https://localhost:8443'
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


def redeploy(name):
    """Recreate only our test container, preserving its mounts and environment."""
    assert name in {'session-test-portal-dev', 'session-test-pidp-dev'}
    container = client.containers.get(name)
    config = container.attrs['Config']
    host_config = container.attrs['HostConfig']
    assert host_config['NetworkMode'] == 'orgportal-session-test'
    container.stop(timeout=10)
    container.remove()
    created = client.api.create_container(
        image=config['Image'], name=name, command=config['Cmd'],
        environment=config['Env'], working_dir=config['WorkingDir'],
        volumes=config.get('Volumes'), host_config=host_config,
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

    redeploy('session-test-portal-dev')
    redeploy('session-test-pidp-dev')
    # The gateway must re-resolve the recreated containers, whose IPs can change.
    client.containers.get('session-test-local-gateway').restart(timeout=10)
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
