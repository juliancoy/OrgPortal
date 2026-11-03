# Maryland Comptroller transaction integration — prepared, not published

Target: OrgPortal `master_transaction_records`, which supplies the ecosystem's
financial evidence. Account checked live: verified `julian@codecollective.us`;
the saved `platform-admin` connection has operator access to the LifeTech API.
No production data, schema, permissions, or traffic has been changed.

Validated batch: **113,671 observations** — 16,817 BPW rows (2022-09-14 to
2026-09-16) and 96,854 MD-VIEW payment totals (2023-10-03 to 2026-11-02).
All 72 advertised agency searches succeeded; 96 source queries include date
partitions for the larger searches. Normalized JSONL SHA256:
`1c33886e51e48b167645466c59f3c667ec7cac438326f1e78514214e4cec7cd8`.
The federal aggregate ZIP contains 25 geographic CSV tables and stays separate.

Validation passed: four collector tests, four API/import tests, TypeScript,
full-schema real-data import twice, signed-cent reconciliation, original
transaction preservation, foreign-key checks, database integrity and diff checks.
See `artifacts/maryland-comptroller/validation.json` and `manifest.json`.

## Reviewable change

Migration `0131_external_financial_observations.sql` adds a reusable public observation table with source-system, currency, measurement and JSON metadata columns
and extends the existing master transaction view. All prior view branches are
preserved. This is evidence alongside the internal ledger; importing observations
does not create settled ledger transfers or change account balances.

`preview_maryland_comptroller_import` and `apply_maryland_comptroller_import`
accept at most 250 rows per request through the authenticated MCP connection.
`get_maryland_comptroller_import_status` returns source counts/checksums or
inspects an exact operation receipt. The saved operator grant is MCP-scoped;
the importer does not use the browser-facing session API. It requires the existing live operator identity and organization
authorization, rate limit, and exact expiring preview/apply receipt. Each batch
inserts observations and its minimal audit record atomically. An unchanged import
is idempotent. A changed payment with the same identifier stops for source review.
No names are automatically merged into directory organizations or assigned owners.
BPW content hashes identify source observations, not distinct additive contracts;
a revised agenda row is another observation and needs reconciliation before totals.

## Sources and coverage

- [BPW dashboard](https://interactive.marylandcomptroller.gov/BPWDashboard): all
  table rows from the unfiltered search. The source covers September 14, 2022
  through September 16, 2026. Rows include amendments, options, revenue, zero-dollar
  actions and multiple named recipients. Preserve descriptions, agenda/item,
  contract, method, funding source, certification and goals. Negative amounts are
  revenue according to the source header; do not interpret them as refunds.
- [MD-VIEW](https://interactive2.marylandtaxes.gov/MDVIEW/Home/PaymentSearch):
  agency-wide searches for every advertised agency. Searches returning at least
  5,000 rows are recursively partitioned by payment date, and reconciled against
  the unpartitioned baseline. The FAQ documents a 5,000-result maximum and trailing
  13 months, while actual results include older dates and larger initial result
  counts. The manifest records observed coverage rather than assuming the FAQ
  proves completeness. Payment-detail/invoice pages are not collected. The
  available payment total is not an invoice-level allocation. Confidential and
  otherwise unpublished payments are unavailable.
- [Federal spending dashboard](https://dashboards.marylandtaxes.gov/com-dashboards/fed-impact.html):
  retain the complete linked CSV ZIP (25 geographic CSV files). These are top-ten
  agency tables with 2020–2024 annual averages, not individual transactions or an
  exhaustive award feed. Preserve separately; do not add to BPW/MD-VIEW records or
  to USAspending obligations already in the database.
- [Open-data inventory](https://www.marylandcomptroller.gov/reports/open-data/inventory.html),
  [income-tax distribution](https://www.marylandcomptroller.gov/reports/open-data/data-sets/income-tax-distribution.html)
  and [statewide fiscal](https://www.marylandcomptroller.gov/reports/open-data/data-sets/statewide-fiscal-reports.html)
  pages currently display “Coming soon.” No fabricated transaction rows are added.
  Other tax statistics and economic reports need separate aggregate models and
  are not represented as payer-to-recipient transactions.

Amounts remain signed integer cents. Payment identity includes agency code,
payee name, payment number (retaining leading zeros), and payment date. BPW
identity hashes the complete source row to preserve sub-items. Each normalized
row retains its source HTML checksum, retrieval time and public source URL.
Approval observations, disbursement observations, and aggregates must not be
summed together. No claim of a complete historical state ledger is made.

## Reproduce and validate

```sh
python -m pip install -r scripts/requirements-maryland-comptroller.txt
python scripts/collect-maryland-comptroller.py
python scripts/test-maryland-comptroller.py
node --import tsx --test org-worker/test/maryland-comptroller.test.ts
node --import tsx org-worker/scripts/validate-comptroller-import.mjs
npm --prefix org-worker run typecheck
git diff --check
```

Collection resumes from existing source HTML. For a fresh retrieval, use a new
`--output` directory; never mix old cached artifacts with a claim of a fresh
snapshot. `retrieved_at` is the collection-run timestamp, not proof of source
refresh. The default output is `artifacts/maryland-comptroller/`: original HTML,
normalized JSONL, staging SQLite, source manifest, CSV ZIP and validation report.
These are local staging artifacts, not proof of production publication.

The verifier applies the full migration chain to isolated host SQLite, imports
all real normalized observations twice, reconciles exact signed-cent totals,
checks the master projection and preservation of the internal ledger, and checks
foreign keys and integrity. API tests cover denied access, invalid sources,
wrong fact types, duplicate IDs, changed evidence, receipt binding/replay and
rollback on audit failure.

## Authorized publication

Repository `AGENTS.md` requires explicit review for database migrations. The user approved proceeding with the reusable-table design. Migration 0131 and
its compatible master-view extension have been reviewed and locally validated;
apply only this migration, then use the release and authenticated import workflow.
Use the normal OrgPortal release workflow; preserve the unrelated edits already
present in the working tree. Authenticated production imports must use the
reviewed API with this account, not direct SQL or a local-replica upload. Process
one preview/apply batch at a time, respect the 60-request/minute limit, and retain
receipts. Stop on uncertain outcomes; inspect receipt and remote records before
retrying. Compare production source counts and checksums after completion.

The reusable table accepts other source systems, currencies, financial measurements
and nested JSON metadata without a new migration. The Maryland adapter validates
its own official sources and maps them into that table.

The new source type does not yet create identity-linked map edges or join public
organization replicas. That requires reviewed counterparty identity links and
map/replication support; matching display names alone is insufficient.

## Public payee data lifecycle

Payee labels can identify people even when the source is public. Keep no address,
TIN, email or contact columns. Use `retrieved_at` as the annual review clock.
The new table is excluded from immutable journal history. The minimal import
audit contains observation IDs and source hashes, not payee payloads; review and
remove obsolete audit entries within twelve months under the existing policy.

For a verified source correction or deletion, identify the observation IDs,
remove or correct the production evidence through an explicitly reviewed operator
procedure, and remove affected source HTML, normalized JSONL, staging SQLite,
exports and caches. Reapply confirmed deletions before any backup restore. Review
payment payee retention annually and remove observations no longer justified by
public-interest evidence; do not imply automatic expiry or a deployed erasure
workflow. This source does not create memberships or verify legal identity.
