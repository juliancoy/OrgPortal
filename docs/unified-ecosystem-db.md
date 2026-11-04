# Unified ecosystem evidence in the transactional database

Published and verified November 3, 2026 at 03:41 UTC, using verified
`julian@codecollective.us` operator authorization.

The transactional organization database already stores fiscal and non-fiscal
support. `organization_support_records` includes mentoring, venue, services,
in-kind support, incubation, acceleration, collaboration and affiliation; monetary
amounts are nullable. These records join `master_transaction_records` alongside
ledger, company financing, nonprofit grants and external financial observations.

Migrations 0132–0134 add versioned public source records to that same database.
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
The default build fails on database unavailability; it does not silently switch
to archival source files. Explicit verified build snapshots are derivative caches. The index manifest exposes database dataset ID, export time, native
record counts and Comptroller coverage.

Large relationship searches use bounded 1,000-record search chunks. Topology
endpoints use compact integer references. Individual graph responses retain the
250-node/1,000-row limits and a 2 MiB byte budget. Source rows retain their IDs;
the renderer consolidates each ordered source/destination pair on the displayed
page into an edge whose width scales as row count^0.5 by default. Reverse
directions remain separate, the exponent is adjustable, and the edge inspector
lists the individual records. The
default graph uses organizations rather than community summary edges; transaction
row paging exposes remaining edges within the loaded organization scope.
The full paginated Relationships evidence remains available. Approvals are a distinct
edge kind and do not enter payment sizing. Voided records remain evidence but do
not become graph edges. Unresolved counterparties remain source-label groups.

Production builds no longer regenerate the tracked archival layout snapshot.
Saved positions are read from the database export. The standalone position
generator remains an explicit bootstrap/research tool.

0134 maps explicit federal cumulative obligations to `obligation` / `cumulative`
in the master view, while preserving signed amounts and leaving non-fiscal records
unclassified. Original source JSON remains intact.

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

## Verified publication

- Production commit: `ad64ffd19285aef001ad84b4b9b5aa92ebb78dbf`.
- API version: `25d25dbe-ad1c-4b9d-8122-2f485050e771`;
  frontend version: `13097416-70af-4dec-9506-75035492974e`.
- Active database dataset SHA256:
  `bb4b2576d1c37484228863556ee8dc06790d666f751454dad19b2536cc7a461f`.
- 47,236 reviewed source records staged in 238 atomic batches, then activated
  with one publication receipt. Exact record count and complete dataset digest
  reconciled through the authenticated MCP. No pending/uncertain receipts remain.
- Source collections: 14,984 relationships, 2,397 source organizations, 16,463
  events, 80 financing presentations, 6 nonprofit profiles, 10,891 performance
  records, 3 assessments, 2,394 saved positions and 18 metadata records.
- The final DB export also includes 4,428 current directory rows and 120,728 native
  public transaction records: 113,671 Comptroller observations, 3,938 nonprofit
  grants and 3,119 support records.
- Live Relationships queries expose 131,629 total evidence records, including
  96,854 MD-VIEW payments and 16,817 BPW approvals. Non-fiscal examples include
  46 affiliations, 10 collaborations, 6 services, 3 in-kind contributions,
  2 incubation and 51 acceleration records. Mentoring and venue are supported
  schema kinds; this verification does not claim current records of those kinds.
- The shared graph index contains 25,486 nodes and 128,419 eligible edges after
  context/self-edge presentation rules. Every dimensional renderer uses this
  same query source. The full Relationships view also retains program terms and
  other contextual records that are excluded from monetary graph weighting.

Native Cloudflare build `64b4e396-c36e-4db2-80c8-b522c6119c84` passed its full
checks/builds and deployed both services. Service identity, HTML, entry asset and
API proxy checks passed. Read-only public live checks verified dataset provenance,
payment/approval/non-fiscal counts, graph endpoint integrity, node/edge limits and
the 2 MiB response budget. No authenticated production browser testing was used.
Focused migration/MCP tests additionally verify checksum staging, exact receipts,
operator/tenant/scope denial, mirrored-source deduplication, signed financial
semantics, inactive-version erasure and preservation of existing ledger rows.
The complete 47,236-record bootstrap passed SQLite integrity/foreign-key checks.

The index is refreshed on a frontend build; source edits are not immediately live
in the graph cache. Cold queries can be slow: the initial approval query took
6.3 seconds and a cold scoped graph took 16.8 seconds in this verification; the
other sampled public queries completed in under one second. These are observed
receipts, not latency guarantees. Full source counts remain available even when
a graph response is truncated for display.
