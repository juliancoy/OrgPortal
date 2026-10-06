#!/usr/bin/env python3
"""Take online SQLite backups of a local worker, including newsletter originals."""
import argparse
import hashlib
import json
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CODE = """import {DatabaseSync,backup} from 'node:sqlite';import fs from 'node:fs';import path from 'node:path';
const folder=fs.mkdtempSync('/tmp/orgportal-newsletter-backup-');
async function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await scan(file);else if(entry.name.endsWith('.sqlite')){const src=new DatabaseSync(file,{readOnly:true});try{await backup(src,path.join(folder,entry.name))}finally{src.close()}}}}
await scan('/app/.wrangler');console.log(folder);"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--container', default='bmoremedtech-org')
    parser.add_argument('--output', type=Path, default=ROOT / '.local/storage-backups')
    args = parser.parse_args()
    attrs = json.loads(subprocess.check_output(['docker', 'inspect', args.container], text=True))[0]
    if not any(m['Destination'] == '/app' and Path(m['Source']).resolve() == ROOT / 'org-worker' for m in attrs['Mounts']):
        raise ValueError('Expected this checkout’s local worker')
    folder = subprocess.check_output(['docker', 'exec', args.container, 'node', '--disable-warning=ExperimentalWarning', '--input-type=module', '-e', CODE], text=True).strip()
    if not folder.startswith('/tmp/orgportal-newsletter-backup-') or '/' in folder.removeprefix('/tmp/'):
        raise ValueError('Invalid backup location')
    now = datetime.now(timezone.utc)
    output = args.output / (now.strftime('%Y%m%dT%H%M%SZ') + '-' + args.container)
    output.mkdir(parents=True); output.chmod(0o700)
    subprocess.run(['docker', 'cp', args.container + ':' + folder + '/.', str(output)], check=True)
    manifest = {'createdAt': now.isoformat(), 'container': args.container, 'databases': []}
    for file in output.glob('*.sqlite'):
        file.chmod(0o600)
        with sqlite3.connect(file) as db:
            if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok': raise RuntimeError('Corrupt backup')
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            counts = {table: db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] for table in ['local_newsletter_imports', 'newsletter_source_archives', 'ecosystem_sync_changes'] if table in tables}
        manifest['databases'].append({'file': file.name, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'integrity': 'ok', 'counts': counts})
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    subprocess.run(['docker', 'exec', args.container, 'node', '-e', "require('fs').rmSync(process.argv[1],{recursive:true})", folder], check=True)
    print(json.dumps({'backup': str(output), 'databases': len(manifest['databases']), 'integrity': 'ok'}))


if __name__ == '__main__': main()
