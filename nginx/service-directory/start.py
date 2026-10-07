#!/usr/bin/env python3
"""Install the local NGINX service directory and its host-side refresh timer."""
from pathlib import Path
import argparse
import json
import subprocess
import sys

HERE = Path(__file__).resolve().parent
NAME = 'local-service-directory'
SNIPPET = '''    location = /services { return 302 /services/; }
    location ^~ /services/ {
      resolver 127.0.0.11 ipv6=off valid=10s;
      set $service_directory local-service-directory:8080;
      rewrite ^/services/(.*)$ /$1 break;
      proxy_pass http://$service_directory;
    }

'''


def run(*args, capture=False):
    return subprocess.run(args, check=True, text=True, capture_output=capture)


def install_gateway_links():
    ids = run('docker', 'ps', '-q', capture=True).stdout.split()
    containers = json.loads(run('docker', 'inspect', *ids, capture=True).stdout) if ids else []
    networks = set()
    for c in containers:
        if not c['Name'].endswith(('-local-gateway', '-nginx-gateway')):
            continue
        networks.update(c['NetworkSettings']['Networks'])
        mounts = [m for m in c['Mounts'] if m['Type'] == 'bind' and m['Destination'] == '/etc/nginx/nginx.conf']
        if not mounts:
            continue
        config = Path(mounts[0]['Source'])
        before = config.read_text()
        if 'local-service-directory:8080' in before:
            continue
        if '    location /api/org/ {' not in before:
            print(f'No supported portal gateway insertion point: {config}')
            continue
        backup = HERE / 'runtime' / (c['Name'].lstrip('/') + '.nginx.backup')
        if not backup.exists():
            backup.write_text(before)
        config.write_text(before.replace('    location /api/org/ {', SNIPPET + '    location /api/org/ {', 1))
        try:
            run('docker', 'exec', c['Name'].lstrip('/'), 'nginx', '-t')
            run('docker', 'exec', c['Name'].lstrip('/'), 'nginx', '-s', 'reload')
        except subprocess.CalledProcessError:
            config.write_text(before)
            raise
    return networks


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8880)
    args = parser.parse_args()
    run(sys.executable, str(HERE / 'collect.py'))
    exists = subprocess.run(['docker', 'inspect', NAME], capture_output=True).returncode == 0
    if not exists:
        run('docker', 'run', '-d', '--name', NAME, '--restart', 'unless-stopped',
            '-p', f'127.0.0.1:{args.port}:8080',
            '-v', f'{HERE / "nginx.conf"}:/etc/nginx/nginx.conf:ro',
            '-v', f'{HERE / "public"}:/directory:ro',
            '-v', f'{HERE / "runtime"}:/inventory:ro', 'nginx:alpine')
    else:
        run('docker', 'start', NAME)
    networks = install_gateway_links()
    current = json.loads(run('docker', 'inspect', NAME, capture=True).stdout)[0]['NetworkSettings']['Networks']
    for network in networks - current.keys():
        run('docker', 'network', 'connect', network, NAME)
    unit_dir = Path.home() / '.config/systemd/user'
    unit_dir.mkdir(parents=True, exist_ok=True)
    # Quote paths because workspaces can contain spaces.
    command = ' '.join('"' + str(p).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"' for p in [sys.executable, HERE / 'collect.py'])
    (unit_dir / 'local-service-directory.service').write_text(f'''[Unit]
Description=Refresh the local NGINX service inventory
[Service]
Type=oneshot
ExecStart={command}
''')
    (unit_dir / 'local-service-directory.timer').write_text('''[Unit]
Description=Refresh the local NGINX service inventory every 30 seconds
[Timer]
OnBootSec=15s
OnUnitActiveSec=30s
AccuracySec=1s
[Install]
WantedBy=timers.target
''')
    run('systemctl', '--user', 'daemon-reload')
    run('systemctl', '--user', 'enable', '--now', 'local-service-directory.timer')
    run(sys.executable, str(HERE / 'collect.py'))
    print(f'Service directory: http://localhost:{args.port}/')


if __name__ == '__main__':
    main()
