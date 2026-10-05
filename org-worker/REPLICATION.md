# Organization read replicas

Production is the authoritative organization database. Independent deployments
can mirror public organization metadata and documented support evidence. This is
snapshot-based, polling replication, not multi-primary replication or a copy of
private application data. No identities, credentials, memberships, permissions,
account balances, events, or media binaries are copied. Image metadata continues
to reference the existing public media service.

## Deploy a replica

1. Provision a **separate** D1 database (or persistent local Wrangler database),
   configure its DB binding, and apply this worker's migrations.
2. Set `ORGANIZATION_REPLICA_SOURCE` to
   `https://lifetech.fyi/api/org/api/network/replication/snapshot` and
   `ORGANIZATION_REPLICA_INTERVAL_SECONDS` to `300` (60–86400 allowed).
3. Deploy the worker with its existing every-minute cron. Each scheduled event
   checks the interval; organization replica mode disables primary background
   jobs and rejects all HTTP mutations, including MCP uploads. Never bind a
   replica to the production DB. Each replica must own its database.
4. Inspect `/api/network/replication/status`: `checked_at` is the last successful
   check, `applied_at` the last changed snapshot, `etag` its version, and `error`
   the last failure. `stale` becomes true after three refresh intervals without
   a successful check. Bootstrap waits for the first scheduled event.

Use authenticated **primary** OrgPortal APIs/MCP for real edits, preserving
membership, permissions and preview/apply receipts. Local login credentials
are not production credentials. Do not silently forward local session tokens.

## Local deployment

`python run.py` enables replication by default and starts a restartable
`org-replication` Docker poller after the local worker is ready. The poller drives
Wrangler's internal `__scheduled` development endpoint; that endpoint must stay
on the private Docker network. Cloudflare deployments use native cron instead.
The source and interval are configurable with
`ORGPORTAL_ORGANIZATION_REPLICA_SOURCE` and
`ORGPORTAL_ORGANIZATION_REPLICA_INTERVAL_SECONDS`.

For an isolated authenticated test fixture deployment only, explicitly set
`ORGPORTAL_ORGANIZATION_REPLICA_SOURCE=''` before starting. Never use this
fixture database to assess current production records. Replication replaces
organization/support rows, including local-only organizations; accounts remain
local. Back up an existing local database before enabling it.

## Consistency and cost

The primary snapshot reads both tables in one D1 transaction, ordered by ID.
ETags avoid payload transfer and local writes when data is unchanged; the
primary edge cache lasts 60 seconds. Changed snapshots upsert and prune both
tables and record the sync version in one atomic D1 batch. Failed downloads,
invalid payloads and constraint violations retain the last committed snapshot
and expose an error; the next scheduled event retries. Deletions propagate.
A local foreign-key reference that prevents deletion fails the entire refresh;
resolve local fixture references and retry rather than bypassing integrity.

Replicas do not serve snapshots to other replicas. Point every deployment at the
primary; changing the source requires a new database. Expected healthy lag is
one polling interval plus up to 60 seconds of source caching and request time.
Offline replicas remain readable but are marked stale. Full changed snapshots
are suitable for the current small directory; the consumer stops at 8 MiB and
retains its previous data. At larger sizes introduce a paginated versioned feed,
not a truncated directory query. R2 media replication and private-data
replication are separate features.

Tests: `node --import tsx --test test/organization-replication.test.ts`.
