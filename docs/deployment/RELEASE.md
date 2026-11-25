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

## Code releases with a pinned evidence snapshot

When a data backfill is incomplete, a code release may explicitly retain a
reviewed query snapshot instead of exporting the partially imported dataset.
Place exactly one version directory and its original `manifest.json` in a
separate directory within the release checkout. Set
`ORGPORTAL_ECOSYSTEM_QUERY_SNAPSHOT` to that directory (relative to `web`) and
`ORGPORTAL_ECOSYSTEM_QUERY_SHA256` to its tree digest from
`digestPaths(source, ['.'])` in `web/scripts/release-cache.mjs`.
Use the normal pinned-container release build and deployment commands.

This input is checksum-verified before and after copying; missing hashes,
symlinks, mixed versions and conflicting fresh-export settings fail the build.
The snapshot's export timestamp and manifest remain unchanged. The deployment
metadata records its version, dates, digest and explicit selection. This does
not claim fresh data or completion of a backfill. Default builds still perform
the normal export and retain the existing 15-minute cache freshness limit.

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

## Local release acceleration

Frontend and routing checks run concurrently. The ecosystem query suite executes
once in the routing gate; its Vitest wrapper requires a passing proof tied to
that invocation, Node runtime and source checksum. Running the Vitest wrapper on
its own still executes the underlying suite. Both gates must finish successfully.

Passing check receipts are reusable for 15 minutes only when tracked/untracked
source files, submodule state, local test configuration, generated API sources,
lockfiles, runtime and relevant environment are unchanged. Captured results must
also retain their recorded checksums. Reuse is logged with the original passing
time. Failures and source changes during execution cannot produce a cache hit.

The ecosystem build reuses a local verified artifact for at most **15 minutes
from the start of its export**. This is a bounded freshness policy, not a claim
that the remote database has not changed. The public export's dataset ID does
not cover native evidence and directory rows, so it is not used alone as a cache
key. Generator imports, ecosystem source files, dependencies and runtime must
match, and every output file is checksummed. An expired, missing or damaged
artifact triggers a complete export and regeneration; a refresh failure stops
the build instead of silently retaining expired data. Explicit snapshot inputs
always bypass this artifact cache. The deployment manifest retains the original
data provenance and export timestamp.

Force fresh validation or fresh public data through the usual pinned container:

```sh
ORGPORTAL_RELEASE_FRESH_CHECKS=1 python3 ../run.py --release check --target web
ORGPORTAL_REFRESH_ECOSYSTEM=1 python3 ../run.py --release build --target web
```

`ORGPORTAL_ECOSYSTEM_CACHE_MAX_AGE_SECONDS` can shorten freshness from its default
900 seconds (0 disables reuse); values above 900 are rejected. Bundle related
reviewed changes before building, then deploy the matching artifact once. Cached
validation never relaxes clean-checkout, published-commit, artifact-identity or
post-deployment smoke-test requirements.

Native evidence exports request up to 2,000 records per page to reduce network
round trips. The public API retains its 500-record default for existing clients,
validates limits from 1 to 2,000, and bounds each indexed SQL branch before the
final merge. Exporters follow the returned cursor even when an older API returns
smaller pages. Retries, public-field allowlists and dataset checks remain in place.

A production read check on 2026-11-23 retrieved the same 2,000 rows in 0.451 s
with one larger page versus 1.566 s with four 500-row requests, with exact row
and field equality. This is a single network sample, not a whole-build timing
promise. The 554,922-row snapshot needs 278 native requests instead of 1,110.

The complete pre-batching frontend build on 2026-11-23 took 1,472.23 seconds:
752.33 seconds for remote export and query indexing, 360.58 seconds for Vite,
and the remainder for staging and the dry-run upload preparation. The artifact
contained 83,840 files (about 3.9 GB); Cloudflare requested 43,240 changed assets.
Host samples during staging showed 73–78% I/O wait. These costs are separate
from the measured HTTP paging improvement; that improvement is not a promise
of a 3.5× faster complete release.

The installed Wrangler 4.131.0 upload implementation also uses a linear
`manifestLookup.find(...)` for each requested file hash when constructing upload
buckets. At this artifact size, a hash index would avoid repeated full manifest
scans. No vendor code or ongoing upload was modified for this observation.

The first frontend asset-upload session returned 401 Unauthorized after about an
hour; it was stopped after 39,485 completed assets. Re-running only the native
`deploy --target web` command reused the same clean built artifact and completed
3,870 remaining/re-requested assets in a fresh upload session. It did not repeat
the import, export, validation suites or build. Publication and public data checks passed on
2026-11-24 at 00:03 UTC. Retain the matching `.release/site` and `.release/web.json`
when recovering interrupted uploads; changed application code requires a matching build.
