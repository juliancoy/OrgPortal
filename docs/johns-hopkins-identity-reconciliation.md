# Johns Hopkins nonprofit identity reconciliation

Reviewed November 23, 2026 against filed nonprofit returns. The university and
hospital have different EINs and must retain separate organization groups.

| Group | EIN | Formation evidence |
| --- | --- | --- |
| Johns Hopkins University | 52-0595110 | [FY2025 Form 990](https://projects.propublica.org/nonprofits/organizations/520595110/202611359349312681/full) |
| The Johns Hopkins Hospital | 52-0591656 | [FY2025 Form 990](https://projects.propublica.org/nonprofits/organizations/520591656/202641349349308029/full) |
| Johns Hopkins Health System Corporation | 52-1465301 | [FY2025 Form 990 and Schedule R](https://projects.propublica.org/nonprofits/organizations/521465301/202601349349303215/full) |
| Johns Hopkins Bayview Medical Center Inc | 52-1341890 | [FY2025 Form 990 and Schedule R](https://projects.propublica.org/nonprofits/organizations/521341890/202601359349301130/full) |
| Johns Hopkins Applied Physics Laboratory LLC | 52-0595111 | University FY2025 Schedule R, Part I: disregarded entity controlled by the university |

The health system return identifies the hospital and Bayview as separate
controlled tax-exempt entities. The university's Schedule R identifies APL as a
disregarded entity and lists Peabody Institute (EIN 52-0591627) in its group
exemption. Control or a group exemption is a relationship, not permission to
replace distinct EINs with one identity. These relationships are documented in
the profile descriptions and reconciliation manifest; new graph hierarchy edges
have not been published by this operation.

The [official university research identifiers](https://jhura.jhu.edu/proposaldevelopment/goldenrod/)
connect EIN 52-0595110 with federal UEI FTMTDMBR29C7. University school labels are
reviewed against the [official schools directory](https://www.jhu.edu/schools/).
Exact university/trustee name variants and source-reported federal names are
reviewed associations, not assertions that every payee string independently
contains a tax identifier. Ambiguous medical, pharmacy, foundation and unrelated
Hopkins labels remain separate until additional evidence establishes their entity.

The graph previously named `nonprofit:520591656` after a grant recipient label,
“THE JOHNS HOPKINS SIDNEY KIMMEL COMPREHENSIVE CANCER CENTER.” The hospital's own
Form 990 identifies that EIN as The Johns Hopkins Hospital. Its EIN-identified
source node belongs to the hospital group. The separate **name-only** cancer
center source is not automatically attached: the grant label may be imprecise,
and the original reported label remains in its evidence. The nonprofit importer
now prefers the filer's own legal name over grant recipient labels for the same
EIN, while retaining original labels on the grant records.

Production verification on November 24, 2026 confirmed 41 distinct source
associations: university 23, hospital 7, health system 1, Bayview 8, and APL 2.
All five groups were read back from the production API with no cross-group
overlaps. University and APL descriptions now include the filing evidence.

The exact applied source IDs, existing/new directory IDs, and retained unresolved
nodes are in [the reconciliation manifest](data/johns-hopkins-identity-reconciliation.json).
Private preview/apply receipts are retained in the local operation workspace.
Public association history is exposed by the deployed API; authorized editors
can remove associations, with durable exclusions against automatic recreation.
The new matcher editor remains a local frontend change until its release.

## Funding audit coverage

The separate local NIH RePORTER collection contains 65,173 project/subproject
rows across FY1985–FY2027: 65,144 with the university's UEI/IPF identity, 23 for
Bayview, one for the hospital, and five unresolved historical labels. It is
complete for that specific Hopkins organization-name query and saved page totals;
it is not proof that every public funding source or recipient alias is covered.
The collection and checksummed page manifest are not yet imported into production.

Annual summaries exclude subproject rows to avoid adding them to parent project
awards. These amounts are reported awards, not cash disbursements. They must not
be added to USAspending obligations or Form 990 expenses. NIH summaries can change
with later reporting and need not equal an earlier frozen annual table.

Production already contains the previously imported FY2025–FY2026 Maryland
USAspending transactions. Older USAspending transactions, NIH history, subawards,
and complete Hopkins outgoing spending remain separate reconciliation/import work.
Form 990 totals are annual accounting measures, not a complete vendor ledger.

## Lookup performance and release verification

Two additive, non-unique USAspending identity indexes (migration 0137) were
reviewed separately and applied on November 24, 2026. Both current and prior
Workers remain compatible. Production EXPLAIN uses the recipient and agency
identity indexes instead of source-wide scans. No source rows were changed;
index creation increased database size from about 2.27 GB to 2.31 GB.
Rollback, if needed, drops only these two indexes; Worker rollback alone does
not change schema. The interrupted university association was checked against
its operation status, current membership and public audit history before a new
preview was created. All associations subsequently passed production readback.

The isolated index regression verifies idempotency, preservation and query plans.
Matching tests cover separate EINs, ambiguous names, explicit removal exclusions,
permission denial and tenant boundaries. Browser editor checks use isolated
local accounts; live verification uses public API reads. Commands, timestamps
and code fingerprints are in the adjacent TEST_LOG.jsonl.
