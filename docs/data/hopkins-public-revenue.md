# Hopkins annual revenue and Public

The Public node (`aggregate:public`) represents customers and purchases on their
behalf. It is an aggregate category, not a legal entity and not a statement that
all service revenue is paid directly by households. Patient-service revenue may
include insurers and government programs; tuition may include third-party aid.
No payer shares are inferred from these Form 990 categories.

The reviewed manifest is `hopkins-statements-2025.json`. It pins each source
checksum, filing object, EIN, period and canonical organization, and the exact
source line/description used for Public. Review decisions are explicit and
repeatable; there is no automatic name-based attribution of program revenue.

## Fiscal year ending June 30, 2025

| Separate filer | Public/customer categories included | USD |
|---|---|---:|
| Johns Hopkins University, EIN 52-0595110 | Tuition and fees; clinical services; auxiliary sales | 2,668,922,000 |
| The Johns Hopkins Hospital, EIN 52-0591656 | Net patient services; pharmacy; oncology; cardiac surgery; neurosurgery | 3,563,307,591 |
| Johns Hopkins Bayview Medical Center, EIN 52-1341890 | Net patient services; pharmacy | 850,038,928 |
| Johns Hopkins Health System Corporation, EIN 52-1465301 | PACE program revenue | 19,430,675 |

The university amount comprises $1,493,503,000 tuition/fees, $1,055,045,000
clinical services and $120,374,000 auxiliary sales. Its $3,083,918,000 contract
revenue and $884,144,000 affiliate reimbursements are **not** assigned to Public.
Other program revenue without a reviewed customer category remains unspecified.
The health system's affiliation fees and care-transformation revenue likewise
remain separate. Smaller customer categories embedded in other revenue have not
been independently attributed, so Public is limited to the listed categories.

All four filers use accrual accounting. Their own statement totals remain
separate: this is not a consolidated Hopkins group statement. In particular,
intercompany items and the university's disregarded entities must not be summed
across related filers as though they were independent group revenue.

The import includes 41 disjoint annual revenue and expense observations, four
annual profiles, assets and liabilities at year end. The revenue and expense
leaves each reconcile exactly to their filer's Form 990 Part I total. Zero lines
remain in profiles but do not create graph edges. Statement totals are not extra
edges. Contributions, investment returns (including signed losses), other revenue,
compensation, assistance and other expenses retain their source categories.
These are reported historical results, not proposed budgets or individual cash
transactions. They may overlap funding records and are excluded from cash and
award totals and the graph's recorded funding-volume sum.

## Sources and extraction

- University: [FY2025 Form 990](https://projects.propublica.org/nonprofits/organizations/520595110/202611359349312681/full).
- Hospital: [FY2025 Form 990](https://projects.propublica.org/nonprofits/organizations/520591656/202641349349308029/full).
- Bayview: [FY2025 Form 990](https://projects.propublica.org/nonprofits/organizations/521341890/202601359349301130/full).
- Health system: [FY2025 Form 990](https://projects.propublica.org/nonprofits/organizations/521465301/202601349349303215/full).

University, Bayview and health-system figures come from official IRS XML in the
2026 TEOS 05A archive. The IRS index names the hospital object in that archive,
but the ZIP did not contain it. For the hospital, the rendered IRS e-file view
is parsed by exact IRS field paths, with EIN/period checks and a checksum of the
HTML bytes. Its `sourceFormat` is `irs_efile_rendered_html`; the filing timestamp
and amendment status are unavailable, not invented. Original XML and rendered
sources remain in the private operation cache because full filings contain
personal fields; only organization-level statement fields enter the dataset.

This statement import covers the reviewed FY2025 filings. It does not claim
historical NIH awards, all prior fiscal statements, every outgoing vendor
payment, or a complete public/insurer/government payer split.

## Reproduction and corrections

`prepare-nonprofit-statements.py` accepts a manifest, source directory and output
path. It verifies source hashes and exact line reviews, and rejects unreconciled
statements. `prepare-statement-dataset.mjs` reads the current authoritative public
dataset, checks every row and the dataset digest, preserves existing records and
adds the reviewed statements. Real writes use the existing operator-only dataset
preview/apply importer, with a pinned file digest and server commit. The importer
checks the base dataset before staging and publishing; a changed base requires
rebasing the additions. Per-batch receipts and the final dataset digest remain in
`.local/hopkins/revenue/import/` and are not public repository files.

Corrections use a reviewed replacement dataset; immutable active rows are not
silently edited. To remove a Public attribution, change the manifest's reviewed
line mapping and explicitly supersede the prior statement edges in the new
snapshot, retaining the prior dataset/audit receipts. No account balances,
organization membership, legal identity grouping or original cash records change.
