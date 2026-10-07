# Fund node pies

The network presents the three source-backed TEDCO fund identities inside the
TEDCO node. `fund-pies.js` records the administrator and sources; the Life Science
Investment Fund is also marked as under the Seed Funds umbrella. Original
organizations, award endpoints, source labels and evidence remain distinct in the
Relationships view. This is a presentation grouping, not an organization merger.

Every node with positive disclosed USD award amounts has proportional pie slices.
Recipients show incoming amounts by funder. Fund administrators show outgoing
awards by administered fund. Other funders without disclosed incoming amounts show
outgoing awards by recipient. Receipts and onward awards are never combined.
The inspector shows the same colors, amounts, percentages, dates and sources.

These are recorded awards across dates, not total fund sizes, cash balances,
regional totals or evidence of payment. Unknown and non-USD amounts are excluded;
portfolio aggregates, program terms, agency budgets and voided records are excluded.
Fund capitalization follows the existing opt-in switch. Matching financing and
relationship records are deduplicated. Node radius retains the existing logarithmic
largest-award sizing; slice proportions use disclosed amounts in the chosen direction.

On 2026-10-06 TEDCO's recorded outgoing awards total $1,250,400:
Equitech $500,400 (40.0%), Life Science Investment Fund $500,000 (40.0%),
Seed Funds / SSBCI $250,000 (20.0%). This excludes the overlapping $500,000
LSIF portfolio aggregate and separates TEDCO's incoming federal awards.

Checks: six focused tests in `web/scripts/fund-pies.test.mjs`, full ecosystem tests,
web tests, TypeScript, and headless local/live browser checks covering WebGL/SVG,
fund grouping, exact amounts, accessible detail pies and desktop/mobile viewport.
