# Federal historical storage review — 2026-11-24

Scope: preserve all Maryland-linked public USAspending transaction years, with
separate Hopkins legal entities and immutable source IDs. The collected history
already exceeds 3.6 million unique records. Its normalized staging table exceeds
5 GB before the remaining years, indexes and existing application data. D1 has a
10 GB per-database limit, so new federal observations use four financial-only
D1 stores selected by the first SHA256 digit (0–3, 4–7, 8–b, c–f).

Existing records stay in the primary database. Reads combine the existing master
record projection and the four stores. Existing IDs are checked in both their
primary and assigned store before insertion. Source-key collisions, changed
observations, partial bindings and cross-store duplicates fail closed. Names do
not establish identity; the same reviewed association/removal policy applies.

Schema review: `org-worker/financial-migrations/0001_public_observations.sql`
creates only the public observation table, lookup/reconciliation indexes and
minimal import-completion receipts in newly created empty databases. It does not
alter existing application tables, membership, balances or grants. Apply it as
an explicit provisioning step, independently of the ordinary code release.

Writes require the existing live operator/tenant checks and exact one-use preview.
Each batch targets one financial store. Source rows and a checksum-bound receipt
commit atomically there. Actor/tenant ownership remains in the primary operation;
a lost primary completion reply is reconciled against the atomic store receipt.
No request that may have committed is blindly replayed. Public exports allow only
financial fields and use bounded indexed pages across all stores.

Lifecycle: public payee names can identify people. Financial stores follow the
existing public-source correction/deletion policy and annual manual review,
starting 2026-11-24; next review 2027-11-24. Completion receipts retain no actor,
contact or source payload, and are reviewed after 12 months. No automated expiry
is claimed. Corrections/deletions must cover the assigned store, public snapshots,
local source derivatives and backups; reapply deletions before restoring service.
The application audit/preview store keeps its existing private retention rules.

Rollback: reverting code cannot undo stored data. Before import, empty stores may
remain attached and unused. After import, use the last healthy code version that
understands all four stores; an older version would hide historical observations.
Never delete populated stores as a release rollback. Keep the existing main
records and validated source receipts throughout migration and reconciliation.

Validation required before enabling writes: schema on isolated SQLite databases;
exact replay/correction checks; cross-store pagination with no omissions; fiscal
and source totals; operator/tenant denial; atomic receipt recovery; legacy fallback;
TypeScript; read-only deployed service/commit/API checks. Provisioning identities,
schema digests and publication receipts are recorded separately.

Platform reference: https://developers.cloudflare.com/d1/platform/limits/

Additional primary-store index review: migration 0138 creates covering indexes
for fiscal reconciliation and source-checksum counts on existing public records.
Without these indexes, SQLite sorts all 434,193 existing rows and can exhaust
D1 memory during concurrent imports, even with the shorter date-based key.
The migration changes no rows, identifiers, balances or permissions. New and old
code remain compatible; rollback may leave the unused indexes intact. Verify
query plans avoid temporary sorting and compare counts before/after; apply this
explicitly, outside the code deployment. Financial stores already have equivalent
indexes in their initial schema.
