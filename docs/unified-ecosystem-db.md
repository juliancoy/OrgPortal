# Unified ecosystem evidence in the transactional database

Implementation candidate, November 3, 2026. Publication and verification pending.

The transactional organization database already stores fiscal and non-fiscal
support. `organization_support_records` includes mentoring, venue, services,
in-kind support, incubation, acceleration, collaboration and affiliation; monetary
amounts are nullable. These records join `master_transaction_records` alongside
ledger, company financing, nonprofit grants and external financial observations.

Migration 0132 adds versioned public source records to that same database.
Collections preserve source organizations, relationships, financing presentations,
events, nonprofit profiles, performance evidence/assessments, metadata and saved
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

0132 is additive apart from rebuilding the master view. It preserves every existing
view branch and leaves ledger balances, memberships, permissions and source rows
unchanged. A full migration-chain fixture verifies preservation and integrity.
An older Worker can continue reading the old columns; rollback does not remove
new records. Do not remove source tables during a code rollback. Database schema
application is an explicit operation separate from a Worker release.

## Lifecycle and corrections

`created_at` / `activated_at` are the annual manual review clocks. No automatic
expiry is claimed. Keep public evidence only; do not import private contact,
credential, membership or subscriber datasets. The new tables are excluded from
the immutable journal so corrections/deletions can be honored. A reviewed dataset
deletion cascades its source records. Regenerate graph exports/indexes after any
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
