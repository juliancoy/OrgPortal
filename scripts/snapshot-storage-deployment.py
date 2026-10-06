#!/usr/bin/env python3
"""Create a reproducible source manifest/archive without exporting local secrets."""
import argparse
import hashlib
import json
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args], text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '.local/deployments')
    args = parser.parse_args()
    # Only Git-visible source files. Neither environment files nor DB/cookie data
    # belong in source version control, including explicitly tracked mistakes.
    selected = {}
    for name in git('ls-files', '--cached', '--others', '--exclude-standard').splitlines():
        path = Path(name)
        if any(part.startswith('.env') or part.startswith('.dev.vars') or part in {'node_modules', '.local', '.wrangler'} for part in path.parts):
            continue
        if path.suffix in {'.pem', '.key', '.crt', '.p12', '.sqlite', '.db'}:
            continue
        if name.startswith(('org-worker/', 'shared/', 'web/', 'scripts/', 'docs/')) or name in {'run.py', 'docker_utils.py', 'requirements.txt', 'AGENTS.md', 'README.md', '.gitignore'}:
            source = ROOT / path
            if source.is_file() and not source.is_symlink():
                selected[name] = hashlib.sha256(source.read_bytes()).hexdigest()
    digest = hashlib.sha256(json.dumps(selected, sort_keys=True).encode()).hexdigest()
    args.output.mkdir(parents=True, exist_ok=True)
    archive = args.output / (digest + '.tar.gz')
    manifest = {
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'gitHead': git('rev-parse', 'HEAD'),
        'gitDirty': bool(git('status', '--porcelain')),
        'sourceSha256': digest,
        'contract': json.loads((ROOT / 'docs/deployment/storage-contract.json').read_text()),
        'files': selected,
        'migrationHashes': {name: value for name, value in selected.items() if name.startswith('org-worker/migrations/')},
        'archive': archive.name,
    }
    merge = ROOT / git('rev-parse', '--git-path', 'MERGE_HEAD')
    manifest['pendingMergeParents'] = merge.read_text().splitlines() if merge.exists() else []
    with tarfile.open(archive, 'w:gz') as tar:
        for name in selected:
            tar.add(ROOT / name, arcname=name, recursive=False)
    manifest['archiveSha256'] = hashlib.sha256(archive.read_bytes()).hexdigest()
    target = args.output / (digest + '.json')
    target.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'manifest': str(target), 'sourceSha256': digest, 'gitHead': manifest['gitHead'], 'gitDirty': manifest['gitDirty']}))


if __name__ == '__main__':
    main()
