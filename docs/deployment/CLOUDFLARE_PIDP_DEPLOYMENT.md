# Cloudflare + PIdP Deployment

This document is legacy/reference. The current Code Collective deployment uses the Hono PIdP Worker at `https://id.codecollective.us` and the org/governance API Worker at `https://org-codecollective.jcloiacon.workers.dev`.

This older deploy path used:

- `portal/web` on **Cloudflare Workers** via `wrangler deploy`
- `portal/governance-backend` on your backend host with Postgres
- hosted PIdP at **https://id.codecollective.us**

## 1) Configure governance backend

Set backend runtime environment:

```bash
export DATABASE_URL='postgresql://<db-user>:<db-password>@<db-host>:5432/<db-name>'
export REDIS_URL='redis://localhost:6379/0'
export PIDP_BASE_URL='https://id.codecollective.us'
```

Then run backend:

```bash
cd portal/governance-backend
uvicorn main:app --host 0.0.0.0 --port 8002
```

Verify:

```bash
curl -i http://127.0.0.1:8002/health
```

## 2) Build and deploy portal web with Wrangler

Install deps and build:

```bash
cd portal/web
npm install
npm run build:cf
```

Deploy, setting proxy origins for API routes:

```bash
npx wrangler deploy \
  --var GOVERNANCE_API_ORIGIN:https://org-codecollective.jcloiacon.workers.dev
```

Notes:

- `/api/governance/*` is proxied to `GOVERNANCE_API_ORIGIN`
- `/pidp/*` is proxied to `https://id.codecollective.us` by default (or `PIDP_API_ORIGIN` if overridden)
- All other routes serve the SPA from `dist/` with `index.html` fallback

## 3) Frontend runtime mode

The web app uses API mode when built with:

```bash
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=/api/governance
```

Because the Worker proxies `/api/governance`, this default works without hardcoding backend URLs in the frontend bundle.
