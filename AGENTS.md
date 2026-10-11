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
- Shared portal releases use CodeCollective. PIdP releases are separate and must
  preserve Python/serverless parity. Do not deploy shared services from MedTech.

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
