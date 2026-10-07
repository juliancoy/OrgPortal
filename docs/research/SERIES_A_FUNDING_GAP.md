# Series A funding gap investigation

Page: `/ecosystem/network/funding`, linked from the graph and evidence views.

The page merges public organization/relationship evidence with the versioned
regional research sample in `web/src/features/ecosystem/funding-research.json`.
The public data loader uses the existing IndexedDB cache and reports when data
is offline. No private newsletter originals or account data are published.

Each company has two separate measures: highest explicitly documented stage,
and largest disclosed USD round. Amounts do not determine stages. A extensions
and A-2 remain A. Grants, prizes, debt, program terms, fund vehicles, cumulative
company funding and targets are excluded. Companies without qualifying evidence
remain unknown. Unknown and seed-only are separate counts.

Closing updates with the same roundKey use the latest report; Rapafusyn's $28M
and $44M reports are not two additive rounds. KaloCyte's reported $2.6M closing
is not its $5M target. Georgiamune's $92.69M report combines B1/B2 tranches.
Liquet's disclosed seed stage is retained despite an undisclosed amount.

Series A amount statistics use one largest disclosed USD A round per company.
The seed-to-A interval uses the first dated seed and first dated A, requires
at least month precision, and excludes missing intervals. It is not an estimated
conversion rate. As-of dates filter rounds, not historical company membership
or source publication dates. Regional coverage is a selected sample, not a census.

2026-10-06 wider regional sample: 18 companies, 17 known stages, one unknown;
five before A (including one explicitly Pre-Series A), seven highest A, five
beyond A. Ten companies have disclosed A amounts: median $20.5M, range
$8M–$150M. No complete dated seed-to-A pairs are documented for this sample;
therefore no regional transition rate or median waiting time is estimated.
The regional sample is the default; portal-only and combined scopes remain available.
Records of financing with undisclosed stage retain the disclosed amount without
inventing an equity instrument or Series label. Amount and stage sorting are separate.

To establish a funding gap, define a seed cohort, obtain complete subsequent
rounds and company status, and compare consistent follow-up windows. Do not label
firms failed or stalled based on missing reports.

Validation: `npx vitest run src/features/ecosystem/fundingStatistics.test.ts` in
`web`, TypeScript build, route contract tests, and headless local browser checks
for filtering, historical cutoff, CSV export, and fixed desktop/mobile viewport.
