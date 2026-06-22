#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_IMAGE="${NODE_IMAGE:-node:22-bookworm-slim}"
CONTAINER_NAME="${CONTAINER_NAME:-codecollective-portal-vite}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-4173}"
PUBLIC_ID_PATH="${PUBLIC_ID_PATH:-/users/chat-robot-a-2def1bd3}"
DETACH=0
CLEAN=0

usage() {
  cat <<'EOF'
Usage: ./serve.sh [options]

Serve the portal locally in a Dockerized Node/Vite container with hot reload.

Options:
  --port <port>       Host port to bind (default: 4173)
  --host <host>       Host address to bind (default: 127.0.0.1; use 0.0.0.0 for LAN/mobile)
  --path <path>       Public ID path to print (default: /users/chat-robot-a-2def1bd3)
  --detach            Run in the background
  --clean             Stop the container and exit
  -h, --help          Show help

Environment:
  NODE_IMAGE          Docker Node image (default: node:22-bookworm-slim)
  CONTAINER_NAME      Docker container name (default: codecollective-portal-vite)
  ORG_API_ORIGIN      Backend for /api/org, default live org worker
  PIDP_PROXY_ORIGIN   Backend for /pidp, default live Code Collective PIdP worker
  PUBLIC_ID_PATH      Path to print for quick mobile preview

Examples:
  ./serve.sh
  ./serve.sh --host 0.0.0.0 --path /users/julian-coy
  ./serve.sh --clean
EOF
}

while (($#)); do
  case "$1" in
    --port)
      PORT="$2"
      shift 2
      ;;
    --host)
      HOST="$2"
      shift 2
      ;;
    --path)
      PUBLIC_ID_PATH="$2"
      shift 2
      ;;
    --detach)
      DETACH=1
      shift
      ;;
    --clean)
      CLEAN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[serve] unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "[serve] docker not found; install Docker first" >&2
  exit 1
fi

if [[ "$CLEAN" -eq 1 ]]; then
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  echo "[serve] stopped $CONTAINER_NAME"
  exit 0
fi

if [[ ! -f "$ROOT_DIR/package.json" ]]; then
  echo "[serve] package.json not found at $ROOT_DIR" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/.vite-docker-cache"

ORG_API_ORIGIN="${ORG_API_ORIGIN:-https://org-codecollective.jcloiacon.workers.dev}"
PIDP_PROXY_ORIGIN="${PIDP_PROXY_ORIGIN:-https://pidp-codecollective.jcloiacon.workers.dev}"
VITE_PIDP_BASE_URL="${VITE_PIDP_BASE_URL:-/pidp}"
VITE_PUBLIC_BASE="${VITE_PUBLIC_BASE:-/}"
VITE_CACHE_DIR="${VITE_CACHE_DIR:-.vite-docker-cache}"
VITE_ALLOWED_HOSTS="${VITE_ALLOWED_HOSTS:-}"

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker_args=(
  run
  --rm
  --name "$CONTAINER_NAME"
  -u "$(id -u):$(id -g)"
  -v "$ROOT_DIR:/app"
  -w /app
  -e HOME=/tmp
  -e VITE_CACHE_DIR="$VITE_CACHE_DIR"
  -e VITE_PUBLIC_BASE="$VITE_PUBLIC_BASE"
  -e VITE_PIDP_BASE_URL="$VITE_PIDP_BASE_URL"
  -e VITE_ALLOWED_HOSTS="$VITE_ALLOWED_HOSTS"
  -e ORG_API_ORIGIN="$ORG_API_ORIGIN"
  -e PIDP_PROXY_ORIGIN="$PIDP_PROXY_ORIGIN"
  -e VITE_HMR_HOST=127.0.0.1
  -p "${HOST}:${PORT}:${PORT}"
)

if [[ "$DETACH" -eq 1 ]]; then
  docker_args+=(-d)
  docker_args+=("$NODE_IMAGE" sh -lc "npm run dev -- --host 0.0.0.0 --port '$PORT'")
  docker "${docker_args[@]}" >/dev/null
  echo "[serve] running $CONTAINER_NAME in background"
else
  docker_args+=(-it)
  docker_args+=("$NODE_IMAGE" sh -lc "npm run dev -- --host 0.0.0.0 --port '$PORT'")
fi

echo "[serve] portal: http://${HOST}:${PORT}/"
echo "[serve] public ID preview: http://${HOST}:${PORT}${PUBLIC_ID_PATH}"
echo "[serve] /api/org -> $ORG_API_ORIGIN"
echo "[serve] /pidp -> $PIDP_PROXY_ORIGIN"

if [[ "$DETACH" -eq 0 ]]; then
  exec docker "${docker_args[@]}"
fi
