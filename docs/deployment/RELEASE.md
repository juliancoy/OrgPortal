# OrgPortal releases

OrgPortal owns the `orgportal-web` frontend and the existing `org-codecollective`
API Worker. The latter name is a stable infrastructure identifier, not a
CodeCollective build dependency. Keeping it avoids moving databases, queues,
secrets or API consumers. PIdP remains an independently released identity service.

## Production releases

Cloudflare Workers Builds builds directly from `juliancoy/OrgPortal`, branch
`main`, using the account's existing Workers Builds deployment credential.
Build environment: `NODE_VERSION=22`, `SKIP_DEPENDENCY_INSTALL=true`, and
`CLOUDFLARE_ACCOUNT_ID` set to the deployment account. Dependencies are installed
explicitly in each package directory by the build command.
The trigger's build and deployment commands are recorded in
`cloudflare/build-trigger.json`. Every release checks and builds both targets
from one clean Git commit, deploys the API followed by the frontend, and verifies
both service identity and commit through public health endpoints. A stale build
cannot release after `main` moves. Pull requests run checks without credentials.

The build can be started directly from Cloudflare Builds or the Builds API.
The main-branch trigger is configured, but push-triggered builds have not fired
during the cutover. Confirm the Cloudflare GitHub App has access to OrgPortal
before relying on automatic deployment. A direct build has been verified.

**Deployment status, 2026-10-13:** do not treat a GitHub push or green GitHub
checks as proof of a production release. Until GitHub push delivery is fixed,
start the native Cloudflare build explicitly, wait for success, and compare
`/health` and `/api/org/health` against the intended commit. The outstanding
setup is to check the Cloudflare GitHub App installation and OrgPortal repository
access, then confirm a real main-branch push creates a build without a manual
request. Do not restore CodeCollective as the deployment path.

The moved domains are `orgportal.cc`, `timebank.codecollective.us`, and
`bmoretimebank.codecollective.us`. LifeTech still requests legacy
`/__portal_root/*` URLs from CodeCollective; those requests are forwarded through
its `ORGPORTAL_WEB` service binding to the independently deployed artifacts.
Keep that compatibility forward until the LifeTech wrapper is updated.

No CodeCollective checkout, frontend build or deployment job is involved.
The existing `codecollective-site-preview` service remains a compatibility
binding for explicitly selected private previews; it is not a production build
dependency.
The frontend artifact includes only `web/dist`, the update manifest, and a
commit-stamped health manifest. Database migrations are never run implicitly.

## Manual targets

Local releases use the digest-pinned Node 22 Debian Bookworm image in
`cloudflare/release-image.txt`. Only Docker, Git and Python are required on the
host; host Node/npm are never used. The container includes npm, Git and Python
with SQLite. Lockfile dependencies are installed inside the container and cached
under `.local/release-container`, with separate caches for each package. Files
are written as the invoking user. GitHub release checks use the same image.

Use these commands from a clean checkout of current `main`:

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
Wrangler configuration. `deploy` rejects dirty or outdated checkouts and build
artifacts from another commit. `verify` can be run separately.

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
