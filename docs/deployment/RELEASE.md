# OrgPortal releases

OrgPortal owns the `orgportal-web` frontend and the existing `org-codecollective`
API Worker. The latter name is a stable infrastructure identifier, not a
CodeCollective build dependency. Keeping it avoids moving databases, queues,
secrets or API consumers. PIdP remains an independently released identity service.

## Production releases

Production releases are explicit and follow local validation. Git pushes do not
build, test, publish images, or deploy automatically. GitHub workflows are
manual-only (`workflow_dispatch`); use them only when remote execution is
explicitly requested. The Cloudflare Workers Builds trigger is disconnected.
Do not recreate a push trigger or make deployment depend on remote checks.

Select one published commit, validate it locally, build it in the pinned local
Docker image, and deploy those exact artifacts later. New pushes to `main` do
not invalidate that tested commit. Deployment still requires a clean checkout,
matching clean build metadata, and proof that the commit is published in the
history of `origin/main`. Cloudflare Builds cannot invoke production deployment.
The API deploys before the frontend, followed by public service/commit, HTML,
JavaScript asset, and API proxy verification. Database migrations stay separate.

The moved domains are `orgportal.cc`, `timebank.codecollective.us`, and
`bmoretimebank.codecollective.us`. LifeTech still requests legacy
`/__portal_root/*` URLs from CodeCollective; those requests are forwarded through
its `ORGPORTAL_WEB` service binding to the independently deployed artifacts.
Keep that compatibility forward until the LifeTech wrapper is updated.

No CodeCollective checkout, frontend build or deployment job is involved.
Development is served by the local launcher. Production has no browser-selected
development assets or preview service binding.
The frontend artifact includes only `web/dist`, the update manifest, and a
commit-stamped health manifest. Database migrations are never run implicitly.

## Manual targets

Local releases use the digest-pinned Node 22 Debian Bookworm image in
`cloudflare/release-image.txt`. Only Docker, Git and Python are required on the
host; host Node/npm are never used. The container includes npm, Git and Python
with SQLite. Lockfile dependencies are installed inside the container and cached
under `.local/release-container`, with separate caches for each package. Files
are written as the invoking user. GitHub release checks use the same image.

Use these commands from a clean checkout of the selected published commit:

```sh
python3 ../run.py --release check
python3 ../run.py --release build
python3 ../run.py --release deploy
```

Add `--target web` or `--target api` for an explicit component release. Use
`--release-checkout /path/to/clean/OrgPortal` to release a clean worktree. Deployment
requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the environment;
never place token values in shell arguments, source control or logs.
The API upload inherits all live bindings and keeps runtime settings, cron,
queue subscriptions and domain assignments. The frontend uses its own checked-in
Wrangler configuration. `deploy` rejects dirty or unpublished checkouts and build
artifacts from another commit. Advancing `main` does not force a rebuild of the
tested release. Reuse local passing checks for unchanged code; do not dispatch
remote tests merely to release. `verify` can be run separately.

## Routing and cutover

`orgportal.cc` and the Timebank subdomains are frontend custom domains.
CodeCollective's static homepage stays on `codecollective-site`. Tenant wrappers
can forward requests through the `ORGPORTAL_WEB` service binding, preserving the
original Request URL, host-bound cookies, authorization and WebSocket upgrade.
The frontend overwrites incoming forwarding headers before calling APIs; clients
cannot select a different tenant by supplying `x-forwarded-host`.

Custom-domain assignment is an explicit infrastructure operation, not part of
ordinary releases. The frontend config intentionally has no `routes` block so a
code release cannot unexpectedly reclaim or remove another Worker's domains.
Do not put OrgPortal custom domains back in CodeCollective's Wrangler config.

## Rollback and verification

Record the frontend and API version IDs printed by each release. To roll back,
use Cloudflare version rollback on the affected Worker, then check `/health`,
`/api/org/health`, the index asset, a nested public page, and OAuth resource
metadata. Rolling back code does not roll back D1, R2 or queues. Backend changes
must remain compatible with the previous frontend during sequential deployment.

For the hosting cutover, leave the prior Worker version available until public
checks pass. A domain can be reassigned to the old frontend for rollback; do not
delete the old Worker or any of its static-site resources. Authenticated login
checks use the isolated local deployment per AGENTS.md; live checks are public
and read-only.

## Identity mount and research access

The public MCP resource is `https://orgportal.cc/mcp`. Its OAuth issuer is
`https://orgportal.cc`, with `/oauth/mcp/*` endpoints and root
`/.well-known/oauth-authorization-server` and `/.well-known/jwks.json` discovery.
The platform `/api/org/mcp` path is retired; brand-specific MCP audiences remain
separate. PIdP's canonical browser base is `https://orgportal.cc/pidp`. The frontend's
`PIDP` service binding targets the existing `pidp-codecollective` Worker; PIdP
remains independently released and retains its database, keys and account subjects.
The central proxy strips `/pidp` and untrusted forwarding headers. Tenant proxies
retain the validated requesting origin for browser-bound SSO. Registered provider
callback URLs and existing OAuth issuers remain compatible.

All `/ecosystem/network` pages require authentication in both the server Worker
and the browser router. Server checks call PIdP's read-only `/auth/session` endpoint.
Guests return through `/users/login?next=...`; outages fail closed with HTTP 503.
Research HTML is private and must never be cached publicly. The evidence snapshots
remain public data; IndexedDB caches them independently of session permissions.

Deploy the PIdP endpoint before releasing the frontend gate. The identity routing
cutover does not run migrations or merge primary/member accounts.
