# LaunchPort evidence reconciliation

Reviewed against the production public API on 2026-11-23. This is a source
coverage correction, not a claim to have LaunchPort's complete accounts.

| Source record | Amount | Classification | Year |
| --- | ---: | --- | --- |
| Equitech workforce grant | USD 41,500 | Reported award | FY2025 |
| Equitech infrastructure grant | USD 234,100 | Reported award | FY2025 |
| Build Our Future, `research-build-future-2025-3` | USD 700,000 | Reported award; payment unverified | FY2025 |
| MD-VIEW payment `056948915`, May 13, 2025 | USD 350,000 | Reported disbursement | FY2025 |

The two Equitech records already exist as `organization_support` in the master
view. Their literal `FY2025` source date must be parsed as a fiscal year without
inventing a transaction day. The Build Our Future record also already exists in
the unified master view as `ecosystem_relationship`; the native support report
is a narrower view. Do not import that award again to compensate for a report's
coverage limits.

The exact Comptroller source node
`source-label:maryland_comptroller:recipient:945c8c8eb703e8c9bf0179d84c6507d1`
(`LAUNCHPORT, LLC`) belongs in the shared display grouping centered on
`org-the-launchport`. This explicit, user-reviewed association retains the source
node and original payment. It grants no ownership, membership or legal identity.
Apply through the permission-checked grouping workflow with a one-use receipt.
Private operator receipts remain outside this repository.

The corrected FY2025 grouping shows USD 350,000 received and USD 975,600 in
reported awards separately. There is no established allocation from the payment
to any of these awards, so these amounts must not be added into one received total.
No payment, invoice or settlement is invented by the correction.

Sources:

- [Maryland Build Our Future announcement, June 10, 2025](https://governor.maryland.gov/news/press-releases/governor-moore-announces-695-million-build-our-future-grant-awards-support-innovation-infrastructure)
- [TEDCO FY2027 testimony, FY2025 award list on page 26](https://dbm.maryland.gov/budget/FY2027Testimony/T50.pdf)
- [Maryland MD-VIEW payment search](https://interactive2.marylandtaxes.gov/MDVIEW/Home/PaymentSearch)
- [Current public EcoMap evidence](https://orgportal.cc/api/ecosystem/organization-evidence?org=org-the-launchport&fy=all)

The renderer separates grant/award evidence from payments unless the source has
an explicit disbursement fact, paid grant status or delivered transfer status.
Explicit financial facts take precedence. Counts, source URLs and original
observations remain available, including when awards are excluded from cash
volume and received/disbursed bubbles.
