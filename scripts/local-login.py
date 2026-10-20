#!/usr/bin/env python3
"""Open a normal browser session for a synthetic local Docker member."""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import secrets
import sys
import ssl
import subprocess
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import webbrowser

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from local_developer import ensure_local_admin

LOOPBACK = {'localhost', '127.0.0.1', '::1'}


def local_base(value):
    url = urlsplit(value)
    if url.scheme not in {'http', 'https'} or url.hostname != 'localhost' or url.username or url.password or url.path not in {'', '/'} or url.query or url.fragment:
        raise ValueError('Use a localhost gateway origin, e.g. https://localhost:8443.')
    return value.rstrip('/')


def local_next(value):
    if not value.startswith('/') or value.startswith('//') or any(ord(c) < 32 or c == '\\' for c in value):
        raise ValueError('--next must be a local page path.')
    return value


def docker_inspect(name):
    result = subprocess.run(['docker', 'inspect', name], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'Local Docker service {name} is unavailable.')
    return json.loads(result.stdout)[0]


def preflight(container, base):
    context = subprocess.run(['docker','context','inspect','--format','{{json .Endpoints.docker.Host}}'], capture_output=True, text=True)
    if context.returncode or not (os.getenv('DOCKER_HOST') or json.loads(context.stdout)).startswith('unix://'):
        raise RuntimeError('Use a local Docker socket, not a remote Docker context.')
    config = docker_inspect(container)
    env = dict(item.split('=', 1) for item in config['Config']['Env'] if '=' in item)
    public = urlsplit(env.get('PUBLIC_BASE_URL', ''))
    if not config['State']['Running'] or public.hostname not in LOOPBACK:
        raise RuntimeError('The selected identity container must be a running loopback deployment.')
    if (public.scheme, public.netloc) != (urlsplit(base).scheme, urlsplit(base).netloc):
        raise RuntimeError('The gateway must match the local identity PUBLIC_BASE_URL.')
    db_host = urlsplit(env.get('DATABASE_URL', '')).hostname
    if not db_host:
        raise RuntimeError('The local identity database is not configured.')
    database = docker_inspect(db_host)
    if not database['State']['Running'] or not set(config['NetworkSettings']['Networks']).intersection(database['NetworkSettings']['Networks']):
        raise RuntimeError('Identity must use a running database on the same local Docker network.')
    # Reach the gateway before creating a fixture or minting a session.
    with urlopen(base + '/pidp/health', context=ssl._create_unverified_context(), timeout=10) as response:
        if response.status != 200:
            raise RuntimeError('The local gateway is unavailable. Start the local deployment first.')


def session(container, admin=False):
    result = subprocess.run(['docker', 'exec', '-e', 'ORGPORTAL_LOCAL_DEVELOPER_SESSION=1', container,
                             '/venv/bin/python', '/app/scripts/local_developer_session.py', *(['--admin'] if admin else [])], capture_output=True, text=True)
    if result.returncode:
        if 'the database system is in recovery mode' in result.stderr:
            raise RuntimeError('The local identity database is in recovery mode. Check its Docker logs and available disk space.')
        raise RuntimeError('Could not create the local developer session. Check the identity container and database logs.')
    return json.loads(result.stdout)


def browser_bridge(account, target, timeout=120, opened=webbrowser.open):
    ticket = '/' + secrets.token_urlsafe(32)
    used = False

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            nonlocal used
            expected_host = f'localhost:{self.server.server_port}'
            if used or self.path != ticket or self.headers.get('Host') != expected_host or self.headers.get('Sec-Fetch-Site') == 'cross-site':
                self.send_error(404)
                return
            used = True
            self.send_response(303)
            self.send_header('Location', target)
            self.send_header('Set-Cookie', f"pidp_token={account['token']}; Path=/; Max-Age={account['max_age']}; HttpOnly; Secure; SameSite=Lax")
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Length', '0')
            self.end_headers()

    with HTTPServer(('127.0.0.1', 0), Handler) as server:
        server.timeout = 1
        server.socket.settimeout(2)
        url = f'http://localhost:{server.server_port}{ticket}'
        print('Local developer sign-in (one use; expires in two minutes):', flush=True)
        print(url, flush=True)
        opened(url)
        expires = time.monotonic() + timeout
        while not used and time.monotonic() < expires:
            server.handle_request()
        if not used:
            raise RuntimeError('The sign-in link expired. Run local-login again.')
    print('Signed in as ' + ('Local Administrator' if account.get('admin') else 'Local Developer') + '. Open:', target, flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='https://localhost:8443')
    parser.add_argument('--container', default='lifetech-identity-api')
    parser.add_argument('--next', help='Page to open; defaults to research, or /admin with --admin.')
    parser.add_argument('--admin', action='store_true', help='Enable and sign in as the synthetic local system administrator.')
    parser.add_argument('--no-open', action='store_true', help='Print the one-use link without opening a browser.')
    args = parser.parse_args()
    try:
        base, next_path = local_base(args.base), local_next(args.next or ('/admin' if args.admin else '/ecosystem/network'))
        preflight(args.container, base)
        if args.admin:
            print('Preparing the local administrator account…', flush=True)
            ensure_local_admin(args.container, base)
        account = session(args.container, args.admin)
        # Verify this gateway actually uses the selected local identity database/key.
        request = Request(base + '/pidp/auth/me', headers={'Authorization': 'Bearer ' + account['token']})
        with urlopen(request, context=ssl._create_unverified_context(), timeout=10) as response:
            profile = json.load(response)
        if profile.get('id') != account['member_id']:
            raise RuntimeError('The gateway returned a different local identity.')
        browser_bridge(account, base + next_path, opened=(lambda _url: None) if args.no_open else webbrowser.open)
    except (ValueError, RuntimeError, OSError, HTTPError) as error:
        parser.exit(1, f'Local sign-in failed: {error}\n')


if __name__ == '__main__':
    main()
