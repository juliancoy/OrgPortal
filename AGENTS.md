# Agent Notes

## Personal data lifecycle

- Follow [retention and deletion policy](docs/privacy/RETENTION_AND_DELETION.md)
  and [human/agent operations runbook](docs/privacy/OPERATIONS.md) for data changes.
- Every new personal-data store needs a retention clock, deletion path and
  downstream/backup handling. Do not log credentials or private tool payloads.
- Policy targets are not proof of automation. Preserve the implementation-status
  table and verify controls before advertising them. Never run blanket production
  deletion or infer account ownership from an email address.
- Support and privacy contact: julian@codecollective.us.

- The PIdP source is not a submodule of this repository. Use the sibling checkout at `../pidp` when you need to inspect or change PIdP code.
- Do not re-add `pidp/` or `PIdP/` as submodules. Keep OrgPortal changes in this repository and PIdP changes in `../pidp`.

## Account ownership

- Follow the ownership contract in `README.md`. PIdP owns credentials, social
  login/callbacks, identity verification/recovery, sessions, core identity data,
  account security, and OAuth registration/consent/token/revocation behavior.
- OrgPortal owns membership, invitations, organization roles and permissions,
  member profiles, governance, chat, calendars, events, and event galleries.
  Preserve existing provider-integration interfaces; do not duplicate adapters.
- Keep tenant branding, sign-in entry points, and application routing here.
  Reusable authentication/security UI belongs upstream in PIdP; portal account
  views compose domain settings and delegate identity operations to PIdP.
- Preserve the portal's account namespace and validated return context through
  OAuth. Do not route website users through owner login or assume cookies work
  across origins. Never create privileged identity mappings from email.
- PIdP scopes/consent do not grant membership or domain permissions. Check live
  OrgPortal permissions and required preview/apply receipts for API and MCP alike.
- OrgPortal owns its frontend and API releases. Use `scripts/release.mjs` and
  `docs/deployment/RELEASE.md`; never build or deploy it through CodeCollective.
  PIdP releases remain separate and preserve Python/serverless parity.
  Database migrations require explicit review and are not part of ordinary releases.

## Focused tests

- Run the smallest meaningful set of tests for the changed behavior before
  committing. Use host-based tests or isolated local Docker; do not use a VM
  unless the user explicitly requests one.
- For frontend behavior, run the affected Vitest files with
  `npm --prefix web test -- <test paths> --maxWorkers=2` and check TypeScript
  when types or component interfaces change. For API behavior, run the affected
  `node --import tsx --test test/<name>.test.ts` files from `org-worker`, plus
  `npm --prefix org-worker run typecheck` when API code changes.
- For forms or navigation, also run one relevant headless clickthrough against
  isolated local Docker. Use `web/scripts/test-local-team-form.py` for team
  applications, presenter selection, editing, attachments and favorites. Keep
  its dummy accounts, writable fixtures and mail delivery isolated locally.
  Use `web/scripts/test-local-brand-guide.py` for shared portal branding,
  configured palettes, PNG export, mobile layout and tenant-context restoration.
- Include permission denial and tenant isolation tests when authorization
  changes; preservation, compatibility and retention checks when schemas change.
  Expand the suite for shared infrastructure changes, failures or unresolved risk.
- Run checks once after the final relevant changes. Reuse passing results for
  unchanged code; do not repeat full suites locally and in multiple CI systems
  merely to deploy. Existing required CI gates remain mandatory until the
  pipeline itself is explicitly changed and verified.
- Documentation-only changes require a diff/format and reference review, with
  `git diff --check`; they do not require application tests, builds or deployment.
  Report the checks actually run and any material gaps.

## Staged Cloudflare releases

- Prefer a two-version rollout: A is the last healthy version, B is the tested
  candidate. Build each affected service once and promote the same version;
  avoid rebuilding unchanged services or promoting untested artifacts. Keep
  releases in the native Cloudflare workflow and `scripts/release.mjs`.
- Before changing traffic, record both version IDs and the tested commit.
  Where supported, add B at 0% and smoke-test it with version overrides. Verify
  the response's actual version ID: an override can fall back to normal routing.
  Then use a small canary and increase traffic only after the defined observation
  window and health, error-rate and latency checks pass. Restore A on failure.
- Candidate and post-promotion smoke tests must check service/commit identity,
  HTML, the referenced JavaScript asset, and the API proxy. Production checks
  stay read-only and unauthenticated; authenticated clickthroughs stay local.
- Before splitting frontend traffic, implement and verify stable version
  affinity for HTML and hashed assets, and compatible frontend/API routing.
  Randomly mixing versions can break asset loading. Version overrides are for
  testing and explicit service pinning, not general browser routing.
- Database and storage changes must remain compatible with both A and B during
  the rollout. Worker rollback does not undo D1 migrations or storage writes;
  review migration and rollback compatibility separately.
- Current implementation: `cloudflare/build.sh` runs full checks/builds and the
  configured deploy command runs `deploy all` immediately. Gradual promotion and
  focused CI selection are not yet automated. Implement and test them in the
  release tooling before claiming a staged rollout; do not bypass existing gates
  or replace the release workflow with ad hoc production uploads.
- Consult Cloudflare's current [gradual deployment guidance](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/),
  [version overrides](https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/),
  [version affinity](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/version-affinity/)
  and [rollback limitations](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
  before changing the pipeline.

## Browser tests

- Run browser automation headlessly.
- Use the local Docker deployment for tests that log in, retain sessions across
  browser runs, or check login persistence across deployments. Keep their test
  accounts, browser state, and application data local. Verify that both the
  portal and authentication endpoints use the local deployment before running.
- Production browser checks should be read-only and unauthenticated.

## Authoritative organization data

- Always use the remote production OrgPortal API/MCP for real organization data
  reads and edits. For LifeTech use `https://lifetech.fyi/api/org`; preserve its
  tenant hostname, member identity, permissions and preview/apply receipts.
- Local databases retain an eventually consistent public replica, not a source
  for production edits or proof of current production permissions. Check remote
  data before acting; inspect `/api/network/replication/status` for freshness.
- Local newsletter imports and browser edits are explicitly writable through
  `/api/local/newsletters/*`, using the local deployment capability. Their
  durable change log is outside snapshot replacement. This user-authorized
  local data must survive replica refresh. The user has authorized private remote
  newsletter sync through `/api/newsletters/*` using PIdP account consent, live
  introspection, portal scopes and exact preview/apply receipts. Remote newsletter
  histories and originals are isolated by account and resource, and never join
  the public organization snapshot. Local capabilities grant no remote access.
- Run local deployments with organization replication enabled (the run.py
  default). Each replica owns a separate persistent DB; never bind it to the
  production DB. See [replication operations](org-worker/REPLICATION.md).
- The browser-test rule above is an explicit exception: isolated local accounts
  and writable fixture data require `ORGPORTAL_ORGANIZATION_REPLICA_SOURCE=''`.
  Do not run authenticated fixture tests against production or a read replica.
