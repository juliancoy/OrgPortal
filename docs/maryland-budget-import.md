# Maryland state organization, departments and budget funding

The graph reuses the existing `research-state-maryland` State of Maryland
organization and `state-of-maryland` portal slug. Its type is explicitly State
government organization. Organizational/listing relationships connect it to all
80 agency-code entries in the FY2027 funding-source dataset. The state inspector
lists every entry independently of the graph's relevance and node-count limit,
with links to each entry's graph.

The listing distinguishes 24 department entries (the 22 principal departments,
the education department and Military Department), 51 other agencies, offices or
branches, and five budget headings. Budget headings are not represented as legal
organizations or government departments. Independent offices and other branches
are not asserted to report to the Governor.

## Funding semantics and scope

Maryland DBM's funding-source dataset `gy87-e27x` supplies one appropriation edge
per original program/fund-source row. These edges originate at the State of
Maryland organization. Fund type, program and fund-source code are attributes of
the row, not separate organizations. Federal-origin funds retain their federal
classification; administration through the state budget does not imply that
state taxes supplied them.

The 2,360 FY2027 legislative-appropriation rows total $65,184,504,124 within this
dataset's scope. They do not represent a complete state cash-flow statement.
The 117 DHCD rows reconcile to $902,223,261: General Funds $98,876,636; Special
Funds $283,577,978; Federal Funds $512,852,020; American Rescue Plan Act of 21
$6,916,627. The two federal categories sum to the State Archives summary's
$519,768,647. Reimbursable funds and separate capital-budget allocations are not
added to these imported operating-budget funding-source rows.

A separate nonmonetary `agency` / `affiliation` relationship connects each listed
entry to Maryland; it adds no appropriation or cash payment. Appropriations
participate in graph direction, relevance and funding-view filters, but do not
enter payment totals, payment pies, monetary sizing or account balances. Budget
summaries group each fiscal year, status and direction separately. They never
add different years or proposed/working/enacted versions together. Renderers
consolidate displayed rows by ordered node pair and retain individual evidence.

## Sources and identity

Reviewed November 3, 2026:

- https://opendata.maryland.gov/Budget/Maryland-Operating-Budget-Funding-Source/gy87-e27x
- https://operatingbudget.maryland.gov/ (explicit FY2027 legislative appropriation status)
- https://www.msa.maryland.gov/msa/mdmanual/17dhcd/html/dhcdb.html (DHCD reconciliation)
- https://www.maryland.gov/your-government/state-agencies-and-departments
- https://msa.maryland.gov/msa/mdmanual/01glance/pdf/00overview.pdf
- https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gsg&enactments=false&section=8-201

The Socrata description still mentions older years. Status is explicitly reviewed
against DBM's portal, never inferred from stale metadata or a fiscal year alone.
The statewide preparer supports this reviewed year/status only and fails if
source counts, the reviewed 80-code listing or DHCD reconciliation changes.

`web/scripts/maryland-government-agencies.json` is the explicit reviewed identity
crosswalk. Existing agency source IDs and the established TEDCO organization are
reused where matched; other entries use stable DBM agency-code identities. This
does not fuzzy-merge historical labels, city/county departments or federal award
recipient identifiers. It creates no account ownership or privileged directory
identity. The established DHCD counterparty ID and 117 appropriation source IDs
remain stable. Each appropriation retains its original source row, fiscal
period, direct source query, program and fund codes, and budget-status evidence.

## Preparation, publication and lifecycle

Run `web/scripts/prepare-maryland-government.mjs --out /private/dataset.json
--fiscal-year 2027 --budget-status legislative_appropriation`. It verifies every
collection and checksum of the current version-pinned public database snapshot,
preserves unrelated evidence, metadata and positions, and prepares the reviewed
statewide projection. It writes a complete dataset, source archive and checksums
without changing production. Unreferenced fund-category nodes from the initial
DHCD-only projection are removed in the replacement snapshot.

Review counts and SHA256, then publish using the existing
`org-worker/scripts/import-unified-ecosystem.mjs` operator preview/apply workflow
with the reviewed SHA256 and deployed API commit. The previous dataset stays
active until complete digest reconciliation and atomic publication. No schema
migration, account balance change or ledger settlement is involved. A frontend
build refreshes the public graph index from the authoritative database.

The earlier `prepare-maryland-budget.mjs` is the historical DHCD-only preparer;
use the statewide preparer for this model. Public government records inherit the
annual manual review, correction, archived-version deletion and downstream cache
handling in `unified-ecosystem-db.md`. No new personal-data store is introduced.
