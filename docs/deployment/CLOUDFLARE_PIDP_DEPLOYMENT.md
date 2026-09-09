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

## 2) Build and deploy the integrated portal frontend

The standalone portal deployment described by older versions of this document
has been retired. The parent CodeCollective site builds `portal/web` with a
`/p/` base and serves it at `https://codecollective.us/p/`.

From the parent CodeCollective repository:

```bash
./cloudflare/scripts/build_cloudflare_site.sh
npx wrangler deploy
```

Notes:

- `/api/governance/*` is proxied to `GOVERNANCE_API_ORIGIN`
- `/pidp/*` is proxied to `https://id.codecollective.us` by default (or `PIDP_API_ORIGIN` if overridden)
- All other `/p/` routes serve the SPA with `index.html` fallback

## 3) Frontend runtime mode

The web app uses API mode when built with:

```bash
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=/api/governance
```

Because the Worker proxies `/api/governance`, this default works without hardcoding backend URLs in the frontend bundle.
