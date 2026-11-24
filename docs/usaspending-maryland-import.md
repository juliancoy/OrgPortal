# Maryland-related federal funding

The USAspending adapter collects FY2025 and FY2026 prime transactions for every
recipient with either a Maryland recipient location or Maryland primary place of
performance. These are overlapping searches: official transaction keys identify
one observation across both. Contracts and assistance are downloaded separately
because their CSV schemas differ. Federal fiscal years run October–September.

## Validated source batch

The November 23, 2026 collection contains **434,193 unique transactions** across
18,452 reported recipient names (names are not verified legal entities):
246,690 FY2025 transactions totaling $123,582,704,026.49 in signed obligations,
and 187,503 FY2026 transactions totaling $97,978,905,089.85.
The union removes 277,348 repeated records across the location searches.
All eight CSV row counts match their completed export job counts. Contract
search counts exceed CSV counts by 1,237 / 676 for FY2025 performance / recipient
and 743 / 546 for FY2026. Assistance counts match. Two exact award investigations
confirmed duplicate search hits against single entries in award histories; this
does not prove the cause of every search/export difference.

Normalized JSONL SHA256:
`afcd95d1039383a4205e5dbf9865b164629f0c30278aab99e2d822e92afc726a`.
Source artifacts, investigation results and validation report are private under
`../.runtime/federal-maryland-20261123/` in the workspace. Source collection and
validation alone do not establish production publication.

## Meaning and provenance

The imported amount is the signed `federal_action_obligation`, in exact integer
cents. Negative adjustments remain negative. These are obligations and
deobligations, not settled cash or a complete federal disbursement ledger.
Loan face values, subawards, cumulative award balances, and Maryland's federal
spending annual-average dashboard are not added to these transaction amounts.
Source reporting delays, revisions and unpublished records limit coverage.

Every observation retains the official transaction/award keys, source agency
codes, reported recipient label and UEI where supplied, both location fields,
action date, federal fiscal year, award URL, download checksum and retrieval time.
The collector requests only these financial evidence fields and descriptions;
it does not request street addresses, contact data or tax identifiers.

Records enter the existing `external_financial_observations` table and therefore
`master_transaction_records` without a database migration or internal ledger
mutation. EcoMap displays obligation relationships and evidence; cash received,
disbursed, and cash-volume labels remain separate. Counterparties reuse the
existing official USAspending agency-code and recipient UEI namespaces; changing names do not create duplicate UEI nodes. Missing UEIs
and unspecified agency code 999 remain source-label groups. Matching display
names never establish a legal identity, organization ownership or membership. A reviewed identity link is required to
attach a source group to an existing directory organization.

## Collection and verification

Use a private output directory outside the public repository:

```sh
python3 scripts/collect-usaspending.py --years 2025 2026 --output /private/source-run
python3 scripts/test-usaspending.py
```

Each of eight source partitions (year, location scope, contracts/assistance)
retains the exact request, source count, status and original selected-column ZIP.
The collector rejects partitions at the source's 500,000-row limit, export-count
mismatches, changing evidence across overlapping exports, missing stable IDs,
non-cent amounts and non-Maryland rows. It produces sorted, deduplicated JSONL
and a manifest with record counts, signed-cent totals, overlaps and checksums.
Search counts are retained separately: exact single-award searches were observed
to return duplicate contract transactions absent from both award histories and
the unique-key CSV. The export row count is the integrity check; a search/export
difference is disclosed rather than filled with invented transactions.
Interrupted runs rebuild from their own retained downloads. Use a new directory
for a new source snapshot; a cached artifact is not evidence of a fresh retrieval.

## Reviewed production publication

The authenticated MCP tools are `preview_usaspending_import`,
`apply_usaspending_import`, and `get_usaspending_import_status`. They require
live operator and organization authorization, tenant-bound portal scopes and an
exact, expiring, one-use preview receipt. Batches are limited to 1,000 rows and
also bounded by the existing 1 MiB MCP request limit; the client targets 800 KB.
The existing 60 requests/minute limit remains in force. Inserts and minimal audit
metadata are atomic. Identical transactions are idempotent; a changed source
transaction stops for explicit correction review.
Previews return counts, source hashes, fiscal-year signed-cent totals and endpoint
IDs instead of echoing large source rows. The receipt still fingerprints every
submitted field and the complete import plan; apply must send that exact payload.

After deploying the validated API commit, review the complete manifest and file
SHA256, then use the saved operator connection:

```sh
node org-worker/scripts/import-usaspending.mjs \
  --file /private/source-run/observations.jsonl \
  --expected-sha256 REVIEWED_SHA256 --expected-commit DEPLOYED_COMMIT \
  --directory /private/source-run/receipts --apply
```

The client records each preview/apply result and resumable offset privately.
An uncertain apply stops; inspect its remote operation receipt before any replay.
Completion requires remote counts, signed-cent totals by federal fiscal year and
source checksum counts to match the reviewed source manifest. A local file,
passing test or successful build is not proof of production ingestion. Refresh
and deploy the public ecosystem snapshot after successful reconciliation.

## Lifecycle

Public recipient labels and descriptions may identify individuals. Annual review
uses `retrieved_at`; private publication receipts use their recorded timestamps.
Review whether continued public-interest evidence retention is justified. This
source table is excluded from immutable history. Import audits contain IDs and
source hashes, not complete recipient payloads, and follow the twelve-month
review policy. Credentials remain in the existing OS keyring.

Verified corrections/deletions require an explicitly reviewed operator procedure
covering the production observation IDs, retained ZIPs, JSONL, staging SQLite,
receipts, public exports, deployed snapshots, caches and backup copies. Reapply
confirmed deletions before restoring backups. No automatic expiry or automated
erasure workflow is claimed. Follow the existing
[retention policy](privacy/RETENTION_AND_DELETION.md) and
[operations runbook](privacy/OPERATIONS.md).

## Official references

- [USAspending federal spending guide](https://www.usaspending.gov/federal-spending-guide)
- [USAspending API contracts](https://api.usaspending.gov/docs/endpoints)
- [Maryland federal aggregate dashboard](https://dashboards.marylandtaxes.gov/com-dashboards/fed-impact.html)

## Map size

The graph index keeps individual transaction rows and exact dates. Topology
edges use dictionary-coded integer columns in bounded shards, decoded into typed
arrays with rows materialized only when queried. Node lookup tables use indexed
IDs instead of repeating long source-label IDs. This reduces the memory needed
by the expanded dataset without combining transactions or changing evidence IDs.
Old topology snapshots remain readable during deployment. Focused tests cover
500,000 rows, fiscal filtering, directed traversal and legacy compatibility.

Production uses a stable public-asset reader per asset binding, so simultaneous
requests share one topology load and later pages reuse the decoded version. The
manifest is still fetched afresh; a new snapshot invalidates the cached version.
A local Cloudflare runtime probe with the existing graph plus all 434,193 new
transactions (565,053 edges, 43,338 nodes) passed concurrent cold loads and fiscal
filtering: 24 asset reads total, about 240 ms for the local cold topology, 193 ms
for its first year projection, and 9 ms for a repeated projection. These are local
index measurements, not production page-load promises.

A separate capacity build combined the local public graph replica with all new
transactions: 565,053 graph records, 74,161 assets, and a largest asset of
12,435,851 bytes. It completed with about 3.3 GB resident memory. Its artifacts
are private test output, not a current production snapshot; release still requires
a fresh remote export after the complete import reconciles.

## Production reconciliation, 2026-11-23

The completed production import reconciled **434,193 unique transactions** from
eight official source files against the reviewed source digest
`afcd95d1039383a4205e5dbf9865b164629f0c30278aab99e2d822e92afc726a`.
The private remote verification receipt was recorded at 21:50:06 UTC.

| Federal fiscal year | Transactions | Signed obligation total, cents |
| --- | ---: | ---: |
| FY2025 | 246,690 | 12,358,270,402,649 |
| FY2026 | 187,503 | 9,797,890,508,985 |

These are reported obligations and signed adjustments, not cash receipts or
balances. They do not fill a received-USD label merely because an award exists.
The verified full remote export generated snapshot `6fa7c882645e97f852accdb4`
with 554,922 native records, including all 434,193 federal records, and 565,053
graph records across 43,338 organizations. Its local public query endpoint was
verified against this version; production frontend publication is verified below.

Publication on OrgPortal was verified at **2026-11-24 00:03:18 UTC** (November 23 in
Maryland). Frontend commit `19fe62f4d963607d6ceb9d6fc359c867c60d93fc`, version
`d530cd5c-5c5e-45d9-b8eb-ed7e09a6b150`, serves the full snapshot on OrgPortal.
API commit `ffc123d5ed2f4c6224b94ec0832a0979335acee0`, version
`297af278-830b-4ff8-9b17-7e11c4f230ba`, serves the bounded larger-page export.
Read-only production checks matched the built JavaScript checksum, verified HHS
FY2025 and FY2026 evidence (24,455 and 13,677 records respectively), and traversed
the Maryland map with two parent and child levels (6,012 connections). Native
release checks also verified service identity, HTML, entry JavaScript and API proxy.
