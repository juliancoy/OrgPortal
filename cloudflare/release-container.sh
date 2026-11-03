#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == runtime ]]; then
  node --version
  npm --version
  cat /etc/debian_version
  exit
fi
case "${1:-}" in
  check|build|deploy|verify) ;;
  *) echo 'Use python3 ../run.py --release check|build|deploy|verify --target all|web|api' >&2; exit 2 ;;
esac
packages=(org-worker)
if [[ "${2:-all}" != api ]]; then packages+=(web); fi
if [[ "$1" == check && "${2:-all}" != web ]]; then packages+=(chat-worker); fi
for package in "${packages[@]}"; do
  fingerprint="$(sha256sum "$package/package-lock.json" cloudflare/release-image.txt | sha256sum)"
  marker="$package/node_modules/.orgportal-release-dependencies"
  if [[ ! -f "$marker" ]] || [[ "$(cat "$marker")" != "$fingerprint" ]]; then
    options=()
    if [[ "$package" == chat-worker ]]; then options+=(--omit=dev --ignore-scripts); fi
    npm ci --prefix "$package" --no-audit --no-fund "${options[@]}"
    printf '%s\n' "$fingerprint" > "$marker"
  fi
done
exec node scripts/release.mjs "$@"
