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

No CodeCollective checkout, frontend build or deployment job is involved.
The existing `codecollective-site-preview` service remains a compatibility
binding for explicitly selected private previews; it is not a production build
dependency.
The frontend artifact includes only `web/dist`, the update manifest, and a
commit-stamped health manifest. Database migrations are never run implicitly.

## Manual targets

With Node 22 and the lockfile dependencies installed in `web`, `org-worker`
and `chat-worker`, use:

```sh
node scripts/release.mjs check all
node scripts/release.mjs build all
node scripts/release.mjs deploy all
```

Replace `all` with `web` or `api` for an explicit component release. Deployment
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
