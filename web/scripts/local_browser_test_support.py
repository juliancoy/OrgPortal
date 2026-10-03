#!/usr/bin/env python3
"""Local browser-test configuration and PIdP log-mailbox helpers."""
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

