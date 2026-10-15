# Ecosystem network data

The network includes the complete public organization directory, without a LifeTech tag filter. Production support records are read through the public OrgPortal API. `web/scripts/sync-portal-ecosystem.mjs` refreshes that evidence.

`web/scripts/build-network-history.mjs` reads every available `event_history.json`, `manual_events.json`, and `upcoming_events.json` at the CodeCollective root and its immediate source directories. Set `CODECOLLECTIVE_DIR` for a different checkout. Event occurrences are deduplicated by source URL and start date; cross-listed events with different source URLs remain distinct. All entries with a title and public URL are retained, including undated events. Organization links require source metadata or a Code Collective organizer URL; mentions alone do not establish hosting. The event browser searches the entire dataset and progressively displays results.

`web/public/ecosystem-data/ecosystem-research.json` contains sourced Maryland funding evidence and the user-reported Stand with Crypto contribution of $600 to Code Collective in 2026. The earlier $200 mention is excluded pending clarification. The ten Build Our Future awards retain individual amounts and the announcement date; the program total is not added as an extra transaction. State/agency affiliation is separate from funding. Awards do not establish cash settlement.

These files are public map evidence. They do not write the production `organization_support_records` table or `master_transaction_records` view. Production imports require authenticated API permissions and preview/apply receipts. The archive is a checkout snapshot, not a claim that every live platform event has been exhaustively fetched.

Validation: `npm run test:ecosystem`, `npm run test:events`, both Vite brand builds, and headless browser checks of event search and funding-source selection.

## Federal evidence added October 5, 2026

Federal departments, agencies and their Maryland recipients retain separate identities. The research file now includes NSF, SBA, DOE/ARPA-E, DoD/DARPA, NASA, Commerce/NIST, USDA/NIFA, FDA, CDC, Treasury and HHS; the existing NIH and EDA nodes are matched by name. Thirty-two sourced relationships cover institutional hierarchy, research collaboration, and awards. Examples include NSF's UMD-led quantum simulation institute, SBA FAST and Maryland STEP awards, Treasury's TEDCO BRIDGE award, NIST's historical Maryland MEP founding agreement, ARPA-E's UMD superinsulation project, NASA Dragonfly and DARPA prosthetics at Johns Hopkins APL, NIFA research projects, FDA CERSI centers, and annual CDC PHEP/PHIG funding.

The 2026 TEDCO FAST award amount remains undisclosed. FDA CERSI's $50M maximum is a program ceiling (`terms`), excluded from money-only links. Completed DARPA work and the 2013 NIST award remain explicitly historical. CDC PHIG's cumulative total is excluded because the individual yearly records already represent the funding. NSF's $25M institute award is not repeated as an award to every partner. Every added relationship carries its evidence URL and review date. Coverage remains a sourced selection, not a complete inventory of federal spending.

The shared page is `/ecosystem/network` (under `/p/` on CodeCollective). It uses the common portal navigation and live public tenant API. LifeTech owns its static directory and links into this shared page. The graph renderer aborts pending requests and releases graphics resources when the page unmounts.

## Connected organizations by default

“Hide organizations without connections” is checked initially and after Reset.
It removes nodes with no edges in the currently filtered graph, after category,
relationship, money-view and neighbor filters. Unchecking it reveals otherwise
eligible isolated organizations, including in the money view. Search, organization
details and evidence tables remain available for organizations hidden from the
map. No organization or relationship records are deleted.

Published October 6, 2026 in shared frontend version
`1704c534-3f22-4d66-886d-905b231a8121`. Fifteen ecosystem tests passed,
and the deployment's production route smoke checks passed. A headless browser
check uses saved public evidence to test the default, reveal isolated nodes,
hide all relationships and reset the map.
Both LifeTech and MedTech passed: 143 connected organizations appear by default,
unchecking the option reveals all 570 organizations, disabling all relationship
kinds leaves zero nodes, and Reset restores the checked option and 143 nodes.

## Hover inspector

Hovering a node or its label previews its organization details in the right
column; hovering an edge previews the relationship, amount, date, evidence,
notes and source. Hover does not change selection, the URL, filters or layout.
The last preview stays available when moving into the inspector to use its links.
Clicking a node still selects it. Keyboard focus on node labels and SVG edge
paths provides the same preview; touching an edge opens its evidence.

Pictures come from published OrgPortal organization media or published website
Open Graph/Twitter metadata, with an image-source link. Edge previews label
endpoint images as organization images rather than implying they show an award
or transaction. Missing pictures and failed image loads remain explicit.
`python3 web/scripts/sync-ecosystem-pictures.py` fills missing connected-node
pictures from current public website metadata without credentials or database
writes. Financial sizing and the default connected-node filter remain unchanged.

Published October 6, 2026 in shared frontend version
`548621bf-f76c-417f-ad8d-478683ff9b1a`. Sixteen ecosystem tests passed,
including image URL safety, source escaping and retention of attributed website
preview images during live refresh. Deployment route smoke checks passed.
Headless SVG checks on both domains verify physical node/edge hover, image/source
presentation, unchanged URL and node counts, persistent source links and keyboard
edge focus. WebGL uses raycasting for nodes and widened invisible edge hit areas;
SVG uses widened transparent stroke targets.

Repeat the read-only browser smoke test with
`BROWSER_BINARY=/usr/bin/google-chrome node web/scripts/check-ecosystem-hover.mjs`
(or omit `BROWSER_BINARY` to use Playwright's installed Chromium). The test forces
the SVG renderer and an unavailable live API to verify the saved public snapshot.
Both domains also passed an actual image-loading check. Screenshots are retained
in `docs/screenshots/ecosystem-hover-lifetech.png` and
`docs/screenshots/ecosystem-hover-medtech.png`.

## Viewport map workspace

The network fills the available viewport below the portal header. Vertical page
scrolling is disabled only while this route is mounted and restored on leaving.
The compact toolbar opens Filters, Details, Events, and Sources & help. The filter
and inspector panels scroll independently; events, evidence tables and methodology
remain available in internally scrolling dialogs. Small screens use closable panel
overlays so the map keeps the remaining viewport. The wheel handler covers the
entire canvas, including node labels, and zooms without moving the page.

A headless local check passed at 1440×900, 390×844 and 900×480: document height
stayed within the viewport, wheel over a label changed SVG zoom without scrolling,
controls scrolled internally, and event/source dialogs and mobile panels worked.
Repeat with `BROWSER_BINARY=/usr/bin/google-chrome node web/scripts/check-ecosystem-viewport.mjs`.
Set `MAP_ORIGINS` to comma-separated origins for a local preview.

Published October 6, 2026 in shared frontend version
`c3338606-56f3-4166-ba92-bfdbf13bf64a`. Both live domains passed the viewport
checks in SVG and WebGL modes, including desktop, mobile and short landscape
sizes, wheel zoom over labels, internal panel scrolling and dialog access. The
16 ecosystem tests and production route smoke checks passed. Set
`ECOSYSTEM_RENDERER=webgl` to repeat the browser check with WebGL enabled.
Screenshots: `docs/screenshots/ecosystem-viewport-desktop.png` and
`docs/screenshots/ecosystem-viewport-mobile.png`.

## Direct government award feed (October 14, 2026)

`npm run sync:government` in `web/` fetches Maryland-recipient federal grants
(types 02–05), defaulting to the October 1, 2024–September 30, 2025 date filter.
Pass alternative dates with `npm run sync:government -- YYYY-MM-DD YYYY-MM-DD`.
USAspending's default award date filter compares the latest action date against
start and the base transaction date against end. It is an overlap query, not a
claim that all returned awards began or incurred their full amounts in FY2025.
Amounts are lifetime cumulative obligations, not cash payments or period spending.
Loans, contracts, subawards and other states are outside this first feed.

The importer reconciles unique award IDs against the independent grant count.
USAspending caps searches at 10,000 even with `hasNext=false`; inclusive obligation
amount ranges recover the tail, deduplicating the boundary award. A count mismatch,
malformed response or unpartitionable boundary aborts publication. The last
successful normalized snapshot remains available. Count reconciliation detects
missing records, but does not turn the multi-request API into an atomic snapshot.

The first reconciled search contains **10,888 grants**, including **48 unidentified
awards with $2,066,483.31 net cumulative obligations**. The production organization
`Redacted` (`13bb4caf-d044-488d-a79d-bd7f678be3be`, slug `redacted`) groups these
recipients. Each award retains its government ID and source; the grouping does not
claim that the underlying recipients are one legal entity. Negative and zero
obligations remain records. Summaries use signed integer cents.

Normalized evidence lives in `web/public/ecosystem-data/ecosystem-government.json`.
A timestamped source artifact retains requested public award fields, API messages,
query parameters and count verification. It does not request contact fields.
The relationship snapshot includes these awards; the event archive is kept
separate. UEI or government recipient IDs distinguish legal recipients; name-only
matches do not merge them into existing directory organizations. Records sharing
an explicit `awardKey` count once. Curated announcements lacking government award
IDs still need reconciliation; they are not a complete additive spending ledger.

`0085_government_award_records.sql` adds government observations to
`master_transaction_records` as `government_award`, with obligation/cumulative
financial semantics. `government_award_summary` exposes identified/unidentified
counts and net, positive and negative obligations. Nullable organization links
preserve unidentified or unregistered counterparties without inventing identities.
The importer generates `artifacts/government/award-records.sql`, which upserts each
award and links Redacted when that production ID exists in the target database.
It never changes ledger balances. The source snapshot is the audit reference;
the table retains the latest observation per award. An award disappearing from a
later query is not evidence of cancellation and does not delete its transaction.

Validation uses the full migration chain, signed unidentified sums, idempotent
imports, count reconciliation, identity matching and local headless browser checks.
The initial dataset and migration have been validated in an isolated SQLite
artifact, not applied to production D1. The new table is not yet included in the
organization-replication snapshot. Production publication must include the schema,
reviewed data import and frontend assets; the organization itself is already live.

Operational handling: review this public organization dataset annually and on
correction/deletion requests under the existing retention policy. Remove a record
by its award ID from the source artifact, normalized evidence and generated graph,
and from `government_award_records`; rebuild and redeploy assets, purge cached
copies, and reapply removals before restoring backups. Upstream corrections should
normally replace the observation while retaining the government source ID. Source
artifacts and exports require the same review; this importer does not implement
automatic expiry or cross-service deletion. Do not import contact columns.

## Ecosystem overview

`/ecosystem/network/overview` shows the full network's tracked USD observation
volume, government obligations, other reported USD funding, Redacted subtotal,
organization/connected-organization counts, relationships, event occurrences and
evidence links. Overview links are present in graph and auxiliary navigation.
The full directory count includes the explicitly labeled Redacted grouping;
identity counts do not claim a deduplicated census of legal entities.

`ecosystemOverview.ts` counts a funding observation once across both endpoints
and relationship/financing copies. Award keys take precedence over descriptive
signatures; signed adjustments remain in net totals. Voided records, ceilings,
capitalization, portfolio aggregates and in-kind quantities do not enter USD
volume. Undisclosed/non-USD amounts remain counted separately. Cross-source
observations lacking common award identifiers may overlap; the headline is an
observation total, not verified economic throughput or a money velocity rate.
Government and other funding are broken out so users can inspect their meaning.

The overview loads both relationship evidence and the event archive through the
shared public cache. If the live directory refresh fails, it displays saved
snapshot evidence with an explicit stale-data message. The government retrieval
date and query coverage remain distinct from the time the assets were checked.
Focused accounting tests cover signed obligations, financing duplicates, voided
records, different award IDs, undisclosed amounts and currency separation.
`node scripts/check-ecosystem-overview.mjs` validates desktop/mobile layout,
exact government/Redacted sums, event counts, fallback state and navigation
against a local Vite server on port 5187. Production publication remains pending.

## Nonprofit evidence (October 14, 2026)

`/ecosystem/network/nonprofits` displays EIN, fiscal period, annual revenue,
expenses, book assets and liabilities, filing date and accounting basis, with
links to the filing viewer and original IRS archive. These annual statements
never enter tracked funding volume. The overview links to this page and reports
its evidence coverage. Grant rows join the Relationships view and the graph
where both organization identities are supported by EINs.

The initial scope is six Maryland nonprofits/foundations discovered through
ProPublica's public API: Abell, Baltimore Community Foundation, Annie E. Casey,
Harry and Jeanette Weinberg, United Way of Central Maryland, and Blue Water
Baltimore. Discovery is a selected sample, not a census. The chosen 2025 IRS
index supplies fiscal 2024 filings for all six; United Way's fiscal year ends
June 30 while the other five end December 31. The API's latest extracted
financial period can lag the filing viewer, so original IRS XML supplies every
financial number and grant row. API financial summaries are not substituted
for a missing XML figure.

The imported snapshot contains 3,938 annual grant observations: 3,622 reported
cash grant rows totaling $271,225,559, and 316 future approvals totaling
$71,180,065. Future approvals are retained as `terms` and excluded from tracked
money volume. Schedule I rows follow the filer's accounting basis and are not
independently verified bank payments. Private-foundation paid/future schedules
are reconciled exactly to their stated totals. Noncash assistance is a separate
kind; zero-valued optional noncash fields do not create extra observations.

Only an EIN establishes recipient identity. Named recipients without one retain
their evidence and amount with a nullable target, rather than name-based merging.
Unidentified recipients retain financial rows under the existing Redacted
placeholder. Personal recipient names/addresses, officers, compensation and
donor fields are not published. For unidentified recipients, purpose text is
withheld as well. Portal directory names cannot merge into EIN identities.
Distinct disclosure rows remain distinct even when their amounts and dates match.
Across sources, shared identifiers still need reconciliation before claiming an
additive measure of economic activity.

The normalized `ecosystem-nonprofits.json` includes the selected filing object
IDs, fiscal periods, original archive URLs, checksums, amendment indicators,
retrieval time and retained versions for the chosen fiscal period. The newest
unambiguous filing timestamp selects a version for each filer/period; ambiguous
versions or missing timezones stop publication for review. Published snapshots
are replaced only after all selected organizations have been processed. Raw XML
returns stay in memory; original source archives are not copied into public
assets. HTTP byte ranges retrieve only the archive directory and selected filing,
with ZIP CRC, response-range and size validation. IRS archives using Deflate64
require the pinned decoder in `scripts/requirements-nonprofits.txt`.

Set up and refresh from `web/`:

```sh
python3 -m venv .local/nonprofit-venv
.local/nonprofit-venv/bin/pip install -r scripts/requirements-nonprofits.txt
.local/nonprofit-venv/bin/python scripts/sync-nonprofits.py --index-year 2025
.local/nonprofit-venv/bin/python scripts/nonprofits_test.py
```

An index year is a processing year, not a tax year. Only the selected EINs are
retained while streaming the index. Add reviewed EINs to `TARGETS` to expand the
scope. `--index-file` accepts a filtered IRS index JSON for reproducible retrieval.
The importer generates `artifacts/nonprofits/filing-records.sql`. Migration
`0086_nonprofit_filing_records.sql` separates annual statements and grant rows;
only selected grant observations join `master_transaction_records` as
`nonprofit_grant`. Unknown organizations retain nullable links. Superseded filing
versions remain stored but do not double count in the master view. No ledger
balances change, and no production imports are performed by the refresh script.

Validation: parser tests exercise EIN/period checks, namespace handling, paid
versus future grants, accounting basis, zero/missing values, Schedule I noncash
amounts, personal-field exclusion and schedule reconciliation. Full migration
checks verify amendment selection, unknown counterparties and the separation of
annual statements. The real 3,938-row SQL import was run twice in isolated SQLite
and checked for row counts, foreign keys and integrity. Headless browser checks
cover financial values, EIN search, fiscal evidence links, grant/future drill-down,
overview separation and desktop/mobile layouts.

Retention follows the public organization-record policy: review the dataset
annually from `retrievedAt` and on correction/deletion requests. Remove a subject
EIN from the source target list and published profile, associated grants,
retained versions, caches and transaction artifacts; delete its grant rows before
its filing rows in the database, rebuild/redeploy public evidence, and reapply
removals before restoring backups. Store correction/deletion approvals outside
this public repository. This is an operator procedure, not automated expiry.
The new nonprofit tables are not yet part of the public organization-replication
snapshot. Schema, data import and frontend publication remain local/pending.

Apply each generated data import as one atomic database transaction/batch. A
stale filing must not deselect a newer selected return: the generated selection
update compares filing timestamps, and the unique selected-period index rejects
conflicting older selections. A changed checksum for the same IRS filing object
also stops the database import for explicit source-correction review.

## Maryland intervention dashboard

`/ecosystem/network/interventions` is a separate planning dashboard linked from
all ecosystem navigation. It references the common organization index without
turning financial observations into authority, approval, or political influence.
`build-initiative-directory.mjs` generates a small, public ID/name/category index
from the same merged identities used by the network; rebuilding history also
refreshes this index. After refreshing nonprofit evidence independently, rebuild
this index too. It contains no contacts, permissions or account identities.

The dashboard records outcomes, metrics, baseline/target/current values and dates,
institutional authority with a source, a policy instrument, decision/action
deadlines, the steward organization, next action, constraints, documented facts,
working hypotheses, and result evidence. Proposed, authorized, active, paused and
completed states remain distinct. “Authorized” denotes documented steward
organization authorization; it does not assert government approval. Only a live
organization owner/administrator (or existing platform operator) can publish,
edit or delete. The owning organization also owns the next action; this feature
does not assign duties or permissions to an unrelated organization.

No real initiatives or government decisions are seeded. Anonymous users may
outline an unsaved proposal in page memory, but cannot preview or publish. Page
reload discards that unsaved outline. Published records are explicitly public;
users should describe organization responsibilities rather than private people.
Unavailable API data is shown as unavailable, not as an empty list or zero counts.

Migration `0087_ecosystem_initiatives.sql` adds shared records and version history.
`GET /api/network/initiatives/public?offset=0` and
`GET /api/network/initiatives/public/:id/history?offset=0` paginate public records.
The authenticated `/api/network/initiatives/access` endpoint supplies managed
organizations. `POST /api/network/initiatives` uses existing preview receipts:
submit `{operation:'save'|'delete',initiative}` for a preview, then the identical
payload with `previewId` and `confirm:true`. Permissions and revision numbers are
rechecked at apply time. Receipts are actor-bound, expire and are one-use. A
revision trigger prevents concurrent overwrites; record/version/audit changes
share an atomic database batch. Body and field lengths are bounded.

Authorized/active/completed work requires reviewed facts and their source,
authority and its source, baseline value/date, target/unit/date and authorization
evidence. Completed work also requires a measured result/date and source.
Reviewed evidence is a steward assertion supported by a link, not automatic
verification of external content. Lower-is-better metrics use the same progress
calculation as increasing metrics. Missing measurements never become zero.
Paused/completed records do not appear in overdue counts.

Replica reads of public initiatives/history proxy to the configured primary
without forwarding authentication; local copies do not become authoritative.
Replica writes remain blocked by the existing middleware, and management access
must be checked on the primary. New initiative tables do not enter the public
organization replica snapshot. The dashboard never uses public organization
metadata to infer account permissions.

Retention: public plans and their versions are reviewed annually from
`updated_at`, and on correction/deletion requests, under the existing public
organization-record policy. Confirmed deletion physically removes the plan and
cascades through its versions. Minimal existing audit metadata retains only the
organization ID, revision, resource ID and actor identity under the existing
12-month deletion-audit policy; plan text is not copied there. Apply removals to
exports/caches and replay them before backup restores. These are operator-managed
controls, not automatic annual expiry. Existing preview cleanup applies to
receipts; no credentials or private tool payloads are stored in the new tables.

Validation covers live-role rechecks, preview binding/replay, evidence gates,
stale edits, version retention/deletion and atomic audit failure, plus deadline
and progress arithmetic. Read-only headless browser checks use explicit synthetic
fixtures for cards, filters, draft controls, failure state and desktop/mobile
layout. They do not create accounts or exercise authenticated browser sessions.
Schema/backend publication and authenticated end-to-end acceptance remain pending.

### Public funding performance

`/ecosystem/network/performance` combines the reconciled Maryland federal grant snapshot with a separate, selected historical Maryland Commerce pilot. It includes all signed government award observations and unidentified recipients. It does not imply company-only coverage or rank funding volume as performance. Source-scoped recipient names are not merged with federal legal identities by name.

The historical pilot contains three MEDAAF conditional-loan employment reviews (Advanced BioScience Laboratories, Amick Farms and CD Capital), measured December 31, 2018. The original government PDF is preserved at `web/public/ecosystem-data/sources/maryland-medaaf-fy2019.pdf` with checksum and source-transcription notes in `maryland-medaaf-review.json`. The FY19 filename contains a table titled FY18; individual row dates govern the observations. Later resolution is unknown. The source distinguishes certified and company-reported employment. The historical target attainment views do not imply present-day company quality, job creation, independent verification or causal impact. Company sizes differ.

Run `cd web && npm run build:performance`. Government sync also rebuilds this snapshot. Reviewed input is `web/data/performance-assessments.json`, containing `records` (state pilot observations) and `assessments`. To validate a candidate without changing the reviewed input, run `node scripts/build-performance.mjs --assessments /path/to/candidate.json`; this replaces only the generated snapshot. Copy accepted records into the tracked input and update the source-review record before releasing. Validation completes before the snapshot is replaced. Rebuild and inspect through the shared portal release workflow.

Assessments require: exact `awardKey`, `cohort`, `metric`, `unit`, `direction` (`higher` or `lower`), positive numeric `target`, nonnegative numeric `actual`, `commitment`, `result`, `methodology`, `reviewerOrganization`, `evidenceBasis` (`certified`, `company-reported` or `agency-measured`), HTTPS `commitmentUrl` and `resultUrl`, public `reviewUrl`, and ISO dates `dueDate`, `measuredDate`, `reviewedDate`. The preserved source review path is also accepted for `reviewUrl`. Measurement must occur at or after the reporting deadline and review after measurement. One current review per award; retain original commitments and corrections in version control and the linked review record. Review dates do not refresh measurement dates. Future-dated reviews remain unassessed until their review date. No people or private contacts are collected.

State pilot records require unique `md-commerce:` award keys and `md-commerce:reported-name:` recipient IDs, a named recipient, official Commerce HTTPS source, SHA256, program and original conditional-loan principal measure. They are outside the common transactional ledger and are never added to federal obligations. Federal descriptions are 300-character excerpts linked to original award detail, reducing the dashboard payload from 16 MB to approximately 7 MB.

Cohorts must share program, metric, units, direction and methodology (validated). Reviewers must explain project scale, agreement differences and observation windows. No universal composite score or company performance rollup is published. Higher attainment is actual/target; lower is target/actual. Zero actual for lower-is-better meets the target but has no finite ratio, so no arbitrary percentage is invented. Ratio-scale positive targets are required. Unknown outcomes, unidentified records and immature projects are unassessed. Signed adjustments and allegations never establish misconduct. Public publishing uses reviewed data releases; there is no anonymous rating API.

Comprehensive contracts, state/local incentives, loans, audit findings, CPARS, causal impact and cost-effectiveness remain outside coverage. Source discovery links are labeled accordingly. No current best/worst company ranking has been established.
