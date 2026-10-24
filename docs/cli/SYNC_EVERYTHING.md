# Sync everything API

`POST /api/sync/everything` is a single authenticated orchestration endpoint for
organization-managed records exposed by OrgPortal's authorized domain APIs.
LifeTech's frontend proxy exposes it at
`https://lifetech.fyi/api/org/api/sync/everything`. It uses the same PIdP bearer
grant and exact MCP resource as the existing CLI; cookies, a local fixture login,
and Cloudflare operator tokens cannot substitute for that grant.

The endpoint requires live revocation checks, portal read scope, active
organization membership, and the tenant's exact organization ID. Every underlying
read/write also enforces its own live role and domain scopes. Write modes require
portal write scope. Read replicas cannot serve this endpoint. Responses are
`Cache-Control: no-store`; private payloads and credentials are not logged.

## Catalog and pull

```json
{"organizationId":"EXACT_ID","mode":"catalog"}
```

The catalog returns available read schemas, supported write operations and
explicit coverage limits. To start a pull:

```json
{"organizationId":"EXACT_ID","mode":"pull","limit":3}
```

Repeat with the returned `nextCursor` until it is null. Each cursor is bound to
subject, resource and organization, HMAC signed, and expires after ten minutes. It is a
continuation, not an authorization credential; every page reauthenticates. Signing
uses the configured tenant introspection secret with a sync-specific message
prefix; rotating that secret invalidates existing continuations. A page
contains at most five domain reads. Organization profiles, portal setup/branding,
memberships, personnel scheme, invitations, the account's personnel relationships,
support records, governance motions and native events, and page statistics are
included. Native-event pages enqueue event details, company-vote views and
presentation applications. Motions enqueue their authorized details.

Domain permission failures remain explicit `isError` records. `cycleComplete`
means pagination finished, not that every read succeeded or that the database was
copied. Data is read live across domains rather than as one atomic snapshot.
Reconcile a collection's deletions only after a successful complete collection
cycle; a denied read, failed page or partial response never authorizes deletion.

Coverage is deliberately explicit: the motions API currently caps lists at 100,
and private data outside existing API projections is not silently exported. Chat,
newsletters and external-provider state remain in their separate services. Binary
media uses existing media download/upload APIs; identity credentials, sessions,
grants and another account's private records are excluded. `coverage.complete`
therefore remains false: this endpoint is not a full-database DR export.

## Reviewed outgoing changes

```json
{
  "organizationId":"EXACT_ID",
  "mode":"preview",
  "operation":{"name":"organization_profile","arguments":{"city":"Baltimore"}}
}
```

Review the returned domain preview, then send exactly the same operation arguments
with `mode: "apply"` and its `operation.previewId`. The receiver passes through the
existing one-use, expiring receipt flow, schema validation, stale-state detection,
live permissions and audit behavior. One domain operation executes per request;
there is no misleading cross-domain atomic-batch guarantee. Only the explicitly
reviewed receipt-enforcing operation allowlist is accepted. No raw SQL/table writes
or arbitrary tool names are accepted. Identity/target/receipt fields cannot be
smuggled into operation arguments.

An interrupted apply may already have succeeded. Inspect its domain operation
receipt and current production state before retrying; never automatically replay
notifications, invitations, financial actions or other external effects.

## Local client

```sh
./orgportal sync-everything --connection working-copy --organization EXACT_ID --catalog
./orgportal sync-everything --connection working-copy --organization EXACT_ID
```

The client follows continuation pages into private files in
`~/.orgportal-working-copy`, with credentials kept in the OS keyring. A manifest
advances only after all pages succeed without domain errors. A failed pull removes
its uncommitted pages and retains the prior complete snapshot. Files expire seven
days after capture; the installed working-copy expiry timer and `working-copy
purge` handle these files too. `working-copy forget --organization ID` removes
them without requiring an active grant. This store remains separate from DR and
synthetic fixtures. Existing working-copy draft/preview/sync commands provide
reviewed outbound editing; `sync-everything` itself pulls snapshots.

Endpoint deployment and authenticated acceptance remain required before declaring
this active in production. This change does not perform migrations or deployment.
