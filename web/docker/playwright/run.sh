#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)
image=orgportal-playwright:local
mkdir -p "$root/web/playwright-report" "$root/web/test-results"
docker build -t "$image" -f "$root/web/docker/playwright/Dockerfile" "$root"
exec docker run --rm --workdir /app/web --env CI=1 --env PLAYWRIGHT_PORT=4173 --env PLAYWRIGHT_HOST=0.0.0.0 --env PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 --mount "type=bind,src=$root/web/playwright-report,dst=/app/web/playwright-report" --mount "type=bind,src=$root/web/test-results,dst=/app/web/test-results" "$image" "$@"
