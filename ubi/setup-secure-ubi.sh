#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UBI_DIR="$ROOT_DIR/ubi"

NETWORK_NAME="${NETWORK_NAME:-arkavo}"
PREFIX="${PREFIX:-}"
UBI_SECURE_COCKROACH="${UBI_SECURE_COCKROACH:-1}"

export UBI_SECURE_COCKROACH
export NETWORK_NAME
export PREFIX

if [[ ! -f "$ROOT_DIR/editme.py" ]]; then
  if [[ -f "$ROOT_DIR/editme.example.py" ]]; then
    cp "$ROOT_DIR/editme.example.py" "$ROOT_DIR/editme.py"
    echo "Created $ROOT_DIR/editme.py from editme.example.py"
  else
    echo "Missing $ROOT_DIR/editme.py and editme.example.py; cannot continue." >&2
    exit 1
  fi
fi

echo "Starting secure UBI stack on network '$NETWORK_NAME' (prefix='$PREFIX')..."
python3 "$UBI_DIR/run.py" "$PREFIX" "$NETWORK_NAME"

echo
echo "Container status:"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' | rg -n "NAMES|^.*(cockroach|ubi|ubi-dev)" -n -S || true

echo
echo "Recent logs (ubi):"
docker logs --tail 15 "${PREFIX}ubi" 2>&1 || true
echo
echo "Recent logs (ubi-dev):"
docker logs --tail 15 "${PREFIX}ubi-dev" 2>&1 || true
