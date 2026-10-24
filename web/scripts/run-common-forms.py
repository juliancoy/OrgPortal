#!/usr/bin/env python3
"""Run real local form workflows in Docker Chromium, desktop and Pixel 7."""
import argparse
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version
import json
import os
from pathlib import Path
import socket
import docker_utils
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
DOCKER = ROOT / 'web/docker/forms'
PREFIX = 'common-form-test-'
BASE = 'https://localhost:19458'


def run(*args, **kwargs):
    return subprocess.run(list(args), check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', choices=['desktop', 'pixel'], action='append', help='Default: both')
    args = parser.parse_args()
    required = (DOCKER / 'requirements.txt').read_text().strip().split('==')[1]
    try:
        installed = version('playwright')
    except PackageNotFoundError:
        installed = None
    if installed != required:
        parser.error(f'Install matching client: {sys.executable} -m pip install -r {DOCKER / "requirements.txt"}')
    context = json.loads(run('docker', 'context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}', capture_output=True, text=True).stdout)
    if not (os.environ.get('DOCKER_HOST') or context).startswith('unix://'):
        parser.error('Use a local Docker daemon')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    report = ROOT / '.local/common-form-tests' / stamp
    report.mkdir(parents=True, mode=0o700)
    env = {**os.environ, 'ORGPORTAL_ORGANIZATION_REPLICA_SOURCE': '',
           'ORGPORTAL_LOCAL_BIND_ADDRESS': '127.0.0.1', 'ORGPORTAL_LOCAL_PUBLIC_BASE_URL': BASE,
           'ORGPORTAL_LOCAL_STATE_DIR': str(ROOT / '.local/common-form-stack')}
    # Reuse only our dedicated fixture stack; the test preflight also checks
    # local mail delivery, trusted origins and replication being disabled.
    gateway = subprocess.run(['docker', 'inspect', '--format', '{{.State.Running}}', PREFIX + 'nginx-gateway'], capture_output=True, text=True)
    if gateway.stdout.strip() != 'true':
        run(sys.executable, str(ROOT.parent / 'run.py'), '--prefix', PREFIX,
            '--network', 'common-form-test', '--port', '19458', env=env)
    else:
        # Hot reload picks up API code; keep the reused fixture schema current too.
        run('docker', 'exec', PREFIX + 'community-api', 'npm', 'run', 'db:migrate:local')
    image = f'orgportal-form-browser:{required}'
    docker_utils.build_image(image,DOCKER)
    name = 'orgportal-form-browser-' + stamp.lower()
    results = []
    # Host networking keeps every browser request on the loopback gateway.
    # The browser receives neither the Docker socket nor repository mounts.
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe.bind(('127.0.0.1', 9460))
    try:
        run('docker', 'run', '--pull=never', '--detach', '--rm', '--init', '--network', 'host',
            '--shm-size', '1g', '--name', name, image, stdout=subprocess.DEVNULL)
        for attempt in range(60):
            try:
                with socket.create_connection(('127.0.0.1', 9460), timeout=1):
                    break
            except OSError:
                time.sleep(.5)
        else:
            run('docker', 'logs', name)
            raise RuntimeError('Docker browser did not start')
        for profile in args.device or ['desktop', 'pixel']:
            device = {'desktop': 'Desktop Chrome', 'pixel': 'Pixel 7'}[profile]
            output = report / profile
            output.mkdir()
            test_env = {key: value for key, value in os.environ.items() if key not in {'PLAYWRIGHT_CDP_URL', 'PLAYWRIGHT_CHROMIUM_EXECUTABLE'}}
            test_env.update(PLAYWRIGHT_BASE_URL=BASE, ONBOARDING_PIDP_CONTAINER=PREFIX + 'identity-api',
                            PLAYWRIGHT_WS_ENDPOINT='ws://127.0.0.1:9460/', PLAYWRIGHT_DEVICE=device,
                            TEAM_FORM_REPORT_DIR=str(output), PYTHONUNBUFFERED='1')
            run('node', str(ROOT / 'scripts/test-status.mjs'), 'start', 'browser-' + profile)
            test_env['ORGPORTAL_STATUS_SUITE'] = 'browser-' + profile
            print(f'Running common form cases: {device}', flush=True)
            with (output / 'run.log').open('w') as log:
                process = subprocess.Popen([sys.executable, str(ROOT / 'web/scripts/test-local-team-form.py')],
                                           env=test_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                for line in process.stdout:
                    print(line, end='', flush=True)
                    log.write(line)
                code = process.wait()
            run('node', str(ROOT / 'scripts/test-status.mjs'), 'finish', 'browser-' + profile, str(code))
            results.append({'device': device, 'passed': code == 0, 'exit_code': code, 'artifacts': str(output)})
    finally:
        subprocess.run(['docker', 'rm', '--force', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        (report / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
        print(f'Results: {report}', flush=True)
    return int(any(not result['passed'] for result in results))


if __name__ == '__main__':
    raise SystemExit(main())
