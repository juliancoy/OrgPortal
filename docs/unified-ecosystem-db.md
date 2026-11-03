# Unified ecosystem evidence in the transactional database

Database API deployed November 3, 2026; reviewed source import and graph publication in progress.

The transactional organization database already stores fiscal and non-fiscal
support. `organization_support_records` includes mentoring, venue, services,
in-kind support, incubation, acceleration, collaboration and affiliation; monetary
amounts are nullable. These records join `master_transaction_records` alongside
ledger, company financing, nonprofit grants and external financial observations.

Migrations 0132–0133 add versioned public source records to that same database.
Collections preserve source organizations, relationships, financing presentations,
events, nonprofit profiles, performance evidence/assessments, funding research, metadata and saved
positions. Relationships are projected into the master transaction view, excluding
native records with the same explicit source IDs. Graph source IDs are not account
identities and confer no membership or access. The source payload remains intact.

An operator with live tenant authorization imports checksum-verified records
through one-use MCP preview/apply operations. Batches stage an invisible dataset.
Publication checks every source checksum and activates the complete dataset
atomically. Records are immutable within a version; corrections require a newly
reviewed version. Old datasets remain archived until retention review.

The explicit public export allowlist excludes account ledger entries and account
IDs. Native public support, financing, nonprofit grants and Comptroller facts are
read from the transaction view using keyset pagination without the legacy 100,000
row offset limit. Read replicas forward this export to the authoritative primary;
the old organization snapshot protocol remains compatible.

Comptroller counterparty names without verified IDs become source-label graph
nodes. They may refer to multiple recipients and are not directory registrations
or inferred verified organizations. Approvals, signed adjustments and payment
observations retain different measurement/fact semantics. Displayed graph edges
are projections, not extra ledger settlements.

## Migration review

0133 additionally recognizes explicit `portal:` aliases of native support IDs,
preventing a saved public snapshot from projecting those facts twice. No matching
on display names is used.

0132 is additive apart from rebuilding the master view. It preserves every existing
view branch and leaves ledger balances, memberships, permissions and source rows
unchanged. A full migration-chain fixture verifies preservation and integrity.
An older Worker can continue reading the old columns; rollback does not remove
new records. Do not remove source tables during a code rollback. Database schema
application is an explicit operation separate from a Worker release.

## Graph generation

`web/scripts/build-ecosystem-query.mjs` reads the version-pinned public database
export and overlays native public transaction records. Archival JSON sources are
used only by the explicit bootstrap and isolated tests. The 2D, 3D, 4D and
n-dimensional renderers share this generated query index. It is a public read
cache, refreshed on a frontend build, not a separate writable source of truth.
Database unavailability fails the build; it does not silently switch to archival
source files. The index manifest exposes database dataset ID, export time, native
record counts and Comptroller coverage.

Large relationship searches use bounded 1,000-record search chunks. Topology
endpoints use compact integer references. Individual graph responses retain the
250-node/1,000-edge limits and a 2 MiB byte budget, with explicit truncation and
the full paginated Relationships evidence still available. Approvals are a distinct
edge kind and do not enter payment sizing. Voided records remain evidence but do
not become graph edges. Unresolved counterparties remain source-label groups.

## Lifecycle and corrections

`created_at` / `activated_at` are the annual manual review clocks. No automatic
expiry is claimed. Keep public evidence only; do not import private contact,
credential, membership or subscriber datasets. The new tables are excluded from
the immutable journal so corrections/deletions can be honored. After publishing a reviewed replacement, operator MCP preview/apply with
`action=delete_archived` deletes the superseded dataset and cascades its source
records. Active datasets cannot be deleted through this operation. Regenerate graph exports/indexes after any
correction or deletion, remove obsolete local/browser/downloaded exports, and
reapply confirmed deletions before restoring backups. Include operator audit actor
links in the existing account-erasure process. Review archived versions annually
and delete superseded evidence when no longer needed under the source retention
policy. Raw source artifacts remain archival import evidence, not graph primaries.

## Operations

Prepare a reviewed bootstrap from the currently published public graph artifacts:

```
(cd org-worker && node --import tsx scripts/prepare-unified-ecosystem.mjs /path/to/public-sources /private/bootstrap.json)
```

Review counts and file SHA256, then use `scripts/import-unified-ecosystem.mjs`
with `--file`, `--expected-sha256`, `--expected-commit`, a private receipt
`--directory`, and `--apply`. The saved `platform-admin` connection must resolve
to verified `julian@codecollective.us` with live operator permissions. On uncertain
outcomes inspect `get_ecosystem_dataset_status` with the saved preview ID before
resuming; do not blindly replay the write.
