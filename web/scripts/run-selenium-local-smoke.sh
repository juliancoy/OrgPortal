#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELENIUM_IMAGE="${SELENIUM_IMAGE:-selenium/standalone-chrome:latest}"
SELENIUM_CONTAINER_NAME="${SELENIUM_CONTAINER_NAME:-codecollective-local-selenium}"
PORTAL_PORT="${PORTAL_PORT:-4174}"
SELENIUM_PORT="${SELENIUM_PORT:-4444}"
SELENIUM_URL="${SELENIUM_URL:-http://127.0.0.1:${SELENIUM_PORT}/wd/hub}"
PORTAL_BASE_URL="${PORTAL_BASE_URL:-http://host.docker.internal:${PORTAL_PORT}}"
STARTED_PORTAL=0
STARTED_SELENIUM=0

cleanup() {
  if [[ "$STARTED_SELENIUM" == "1" ]]; then
    docker rm -f "$SELENIUM_CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  if [[ "$STARTED_PORTAL" == "1" ]]; then
    "$ROOT_DIR/serve.sh" --clean >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_for_http() {
  local url="$1"
  local label="$2"
  for _ in $(seq 1 80); do
    if python3 - "$url" <<'PY' >/dev/null 2>&1
import sys
import urllib.request

with urllib.request.urlopen(sys.argv[1], timeout=2) as response:
    if response.status >= 400:
        raise SystemExit(1)
PY
    then
      return 0
    fi
    sleep 1
  done
  echo "[selenium-local] timed out waiting for $label at $url" >&2
  return 1
}

wait_for_selenium() {
  local status_url="http://127.0.0.1:${SELENIUM_PORT}/status"
  for _ in $(seq 1 80); do
    if python3 - "$status_url" <<'PY' >/dev/null 2>&1
import json
import sys
import urllib.request

with urllib.request.urlopen(sys.argv[1], timeout=2) as response:
    payload = json.loads(response.read().decode("utf-8"))
value = payload.get("value", {})
nodes = value.get("nodes") or []
has_up_node = any(node.get("availability") == "UP" for node in nodes)
if not (value.get("ready") or has_up_node):
    raise SystemExit(1)
PY
    then
      return 0
    fi
    sleep 1
  done
  echo "[selenium-local] timed out waiting for Selenium at $SELENIUM_URL" >&2
  return 1
}

if ! command -v docker >/dev/null 2>&1; then
  echo "[selenium-local] docker not found; install Docker first" >&2
  exit 1
fi

if ! python3 - "$PORTAL_PORT" <<'PY' >/dev/null 2>&1
import socket
import sys

sock = socket.create_connection(("127.0.0.1", int(sys.argv[1])), timeout=1)
sock.close()
PY
then
  echo "[selenium-local] starting portal on 0.0.0.0:${PORTAL_PORT}"
  VITE_ALLOWED_HOSTS="${VITE_ALLOWED_HOSTS:-host.docker.internal}" \
    "$ROOT_DIR/serve.sh" --detach --host 0.0.0.0 --port "$PORTAL_PORT"
  STARTED_PORTAL=1
fi

wait_for_http "http://127.0.0.1:${PORTAL_PORT}/" "portal"

if ! python3 - "$SELENIUM_PORT" <<'PY' >/dev/null 2>&1
import socket
import sys

sock = socket.create_connection(("127.0.0.1", int(sys.argv[1])), timeout=1)
sock.close()
PY
then
  echo "[selenium-local] starting ${SELENIUM_IMAGE}"
  docker rm -f "$SELENIUM_CONTAINER_NAME" >/dev/null 2>&1 || true
  docker run -d \
    --name "$SELENIUM_CONTAINER_NAME" \
    --shm-size=2g \
    --add-host=host.docker.internal:host-gateway \
    -e SE_NODE_MAX_SESSIONS=1 \
    -e SE_NODE_OVERRIDE_MAX_SESSIONS=true \
    -p "${SELENIUM_PORT}:4444" \
    "$SELENIUM_IMAGE" >/dev/null
  STARTED_SELENIUM=1
fi

wait_for_selenium

echo "[selenium-local] portal base: ${PORTAL_BASE_URL}"
SELENIUM_URL="$SELENIUM_URL" PORTAL_BASE_URL="$PORTAL_BASE_URL" python3 "$ROOT_DIR/scripts/selenium-local-smoke.py" "$@"
