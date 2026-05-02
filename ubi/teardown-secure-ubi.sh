#!/usr/bin/env bash
set -euo pipefail

PREFIX="${PREFIX:-}"

echo "Stopping secure UBI stack (prefix='$PREFIX')..."
docker rm -f "${PREFIX}ubi" "${PREFIX}ubi-dev" "${PREFIX}cockroach" >/dev/null 2>&1 || true

echo "Remaining related containers:"
docker ps -a --format 'table {{.Names}}\t{{.Status}}' | rg -n "NAMES|^.*(cockroach|ubi|ubi-dev)" -n -S || true
