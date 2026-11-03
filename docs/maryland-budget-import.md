# Maryland DHCD budget funding

The graph distinguishes budget authority from recipient payments. Maryland DBM's
funding-source dataset (`gy87-e27x`) supplies one appropriation edge per original
program/fund-source row. MD-VIEW payment edges remain independent evidence.
Appropriations participate in graph direction and relevance, including funding
view filters, but do not enter payment totals, payment pies or monetary sizing.
The inspector groups budget amounts by fiscal year, budget status and direction;
it never adds different years or proposed/working/enacted versions together.

## Reviewed scope

This import covers only FY2027 legislative appropriation rows for DBM agency S00,
Maryland's Department of Housing and Community Development. The 117 rows sum to
$902,223,261: General Funds $98,876,636; Special Funds $283,577,978; Federal Funds
$512,852,020; American Rescue Plan Act of 21 $6,916,627. The two federal categories
sum to the $519,768,647 federal amount in the State Archives department summary.
Reimbursable funds and separate capital-budget allocations are outside this
funding-source dataset's imported scope; this is not a complete agency cash-flow
statement.

Sources reviewed November 3, 2026:

- https://opendata.maryland.gov/Budget/Maryland-Operating-Budget-Funding-Source/gy87-e27x
- https://operatingbudget.maryland.gov/ (explicit FY2027 legislative appropriation status)
- https://www.msa.maryland.gov/msa/mdmanual/17dhcd/html/dhcdb.html (department reconciliation)

The Socrata dataset's descriptive metadata still mentions older fiscal years.
Do not derive budget status from that text or infer it from a fiscal year. The
preparer supports this explicitly reviewed year/status only and fails if the
source count or published department total no longer reconciles.

## Identity and provenance

An explicit crosswalk links S00 to the existing MD-VIEW agency source-label ID
`source-label:maryland_comptroller:agency:4d8dd1e934535ab80e79f4f52ea96ad9`.
This does not merge city/county housing departments or create a verified directory
organization. Four budget-fund nodes identify the state's funding categories.
Federal-origin funds are labeled explicitly; routing through the state budget
does not imply that state taxes funded them. Each edge retains its original row,
program and fund-source codes, direct source query, fiscal period, budget status
and source evidence. Source keys are deterministic and ambiguous duplicate rows
fail validation. Rendered edges consolidate rows by ordered node pair as usual.

## Publication and lifecycle

`web/scripts/prepare-maryland-budget.mjs --out /private/dataset.json --fiscal-year
2027 --budget-status legislative_appropriation` reads and verifies every collection
of the currently active public database snapshot before adding these records.
It preserves existing evidence, metadata and saved positions. It writes the
reviewable complete dataset, source archive and checksums; it makes no writes.
Publish using the existing `org-worker/scripts/import-unified-ecosystem.mjs`
operator preview/apply workflow with reviewed SHA256 and deployed API commit.
The previous dataset stays active until complete checksum reconciliation and
atomic publication. No schema change or ledger settlement is involved.

These public government records inherit the source-dataset annual manual review,
correction, archived-version deletion and downstream cache handling documented
in `unified-ecosystem-db.md`. No personal-data store or account identity is added.
A frontend build refreshes the query cache from the authoritative database.
