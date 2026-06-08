#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${SELENIUM_CHAT_ENV_FILE:-$ROOT_DIR/.env.selenium-chat}"
SELENIUM_IMAGE="${SELENIUM_IMAGE:-selenium/standalone-chrome:latest}"
SELENIUM_CONTAINER_NAME="${SELENIUM_CONTAINER_NAME:-codecollective-chat-selenium}"
SELENIUM_PORT="${SELENIUM_PORT:-4444}"
SELENIUM_URL="${SELENIUM_URL:-http://127.0.0.1:${SELENIUM_PORT}/wd/hub}"
STARTED_CONTAINER=0

wait_for_selenium() {
  local status_url="http://127.0.0.1:${SELENIUM_PORT}/status"
  for _ in $(seq 1 60); do
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
  return 1
}

cleanup() {
  if [[ "$STARTED_CONTAINER" == "1" ]]; then
    docker rm -f "$SELENIUM_CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -f "$ENV_FILE" ]]; then
  echo "[selenium-chat] loading env: $ENV_FILE"
  set -a
  source "$ENV_FILE"
  set +a
fi

if ! python3 - "$SELENIUM_PORT" <<'PY' >/dev/null 2>&1
import socket
import sys

sock = socket.create_connection(("127.0.0.1", int(sys.argv[1])), timeout=1)
sock.close()
PY
then
  echo "[selenium-chat] starting ${SELENIUM_IMAGE}"
  docker rm -f "$SELENIUM_CONTAINER_NAME" >/dev/null 2>&1 || true
  docker run -d \
    --name "$SELENIUM_CONTAINER_NAME" \
    --shm-size=2g \
    -e SE_NODE_MAX_SESSIONS=2 \
    -e SE_NODE_OVERRIDE_MAX_SESSIONS=true \
    -p "${SELENIUM_PORT}:4444" \
    "$SELENIUM_IMAGE" >/dev/null
  STARTED_CONTAINER=1
fi

echo "[selenium-chat] waiting for Selenium at ${SELENIUM_URL}"
wait_for_selenium

SELENIUM_URL="$SELENIUM_URL" python3 "$ROOT_DIR/scripts/selenium-chat-smoke.py" "$@"
