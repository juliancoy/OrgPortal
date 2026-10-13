#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Cloudflare's preinstalled asdf Python may omit SQLite. Keep the journal
# reproducibility check enabled by using the system Python when necessary.
if ! python3 -c 'import sqlite3' >/dev/null 2>&1; then
  /usr/bin/python3 -c 'import sqlite3'
  mkdir -p .release/tools
  ln -sf /usr/bin/python3 .release/tools/python3
  export PATH="$PWD/.release/tools:$PATH"
fi
npm ci --prefix web
npm ci --prefix org-worker
npm ci --prefix chat-worker
node scripts/release.mjs check all
node scripts/release.mjs build all
