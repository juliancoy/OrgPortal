#!/usr/bin/env python3
"""Install the local journal's user timer; no root privileges or saved secrets."""
import os
import shutil
import subprocess
from pathlib import Path


def unit_quote(value):
    # Preserve literal paths through systemd's specifier/variable expansion.
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%').replace('$', '$$') + '"'


def setup(root=None, state=None):
    root = Path(root or Path(__file__).resolve().parents[1]).resolve()
    state = Path(state or os.getenv('ORGPORTAL_LOCAL_STATE_DIR', str(root / '.local'))).expanduser().resolve()
    node = shutil.which('node')
    if not node or not (root / 'org-worker/node_modules/wrangler/bin/wrangler.js').is_file():
        raise RuntimeError('Install Node.js 22.13+ and run npm ci in org-worker first.')
    version = subprocess.check_output([node, '-p', 'process.versions.node'], text=True).strip()
    major, minor, *_ = map(int, version.split('.'))
    if major < 22 or (major == 22 and minor < 13):
        raise RuntimeError('Journal sync requires Node.js 22.13 or newer.')
    units = Path(os.getenv('XDG_CONFIG_HOME', str(Path.home() / '.config'))) / 'systemd/user'
    units.mkdir(parents=True, exist_ok=True)
    command = ' '.join(unit_quote(part) for part in [node, root / 'org-worker/scripts/orgportal.mjs', 'journal', 'sync', '--file', state / 'journal/change-journal.sqlite'])
    service = f'''[Unit]
Description=Mirror OrgPortal's transactional journal to local SQLite

[Service]
Type=oneshot
WorkingDirectory={str(root).replace('%', '%%')}
ExecStart={command}
Environment=CI=true
UMask=0077
TimeoutStartSec=10min
'''
    timer = '''[Unit]
Description=Keep the local OrgPortal journal current

[Timer]
OnBootSec=30s
OnUnitInactiveSec=60s
Unit=orgportal-journal-sync.service

[Install]
WantedBy=timers.target
'''
    for name, content in [('orgportal-journal-sync.service', service), ('orgportal-journal-sync.timer', timer)]:
        path = units / name
        if not path.exists() or path.read_text() != content:
            path.write_text(content)
        path.chmod(0o600)
    subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', '--user', 'enable', '--now', 'orgportal-journal-sync.timer'], check=True)
    subprocess.run(['systemctl', '--user', 'start', '--no-block', 'orgportal-journal-sync.service'], check=True)
    print('Automatic journal sync enabled (every minute while your user session is running).')
    print('Status: systemctl --user status orgportal-journal-sync.timer orgportal-journal-sync.service')
    print('Logs: journalctl --user -u orgportal-journal-sync.service')


if __name__ == '__main__':
    try:
        setup()
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        raise SystemExit(f'Automatic journal setup failed: {error}')
