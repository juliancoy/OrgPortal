# TEDCO recipient research and registration

The reviewed public research artifacts live in `web/src/data/tedco-recipients.json` and `tedco-recipient-review.json`. Vite publishes them as content-hashed assets for both shared and tenant-root mounts. They are research evidence and import inputs, not a second organization database. The live OrgPortal directory and support records remain authoritative. The TEDCO page distinguishes researched companies from registered descendants, links only registered directory identities, and offers public evidence downloads.

Reviewed October 5, 2026. The roster includes all sectors, historical portfolio companies and documented service recipients. It is **not certified as every company ever supported by TEDCO**. Public reports overlap, exited companies disappear from current portfolios, several reports omit named rosters, and parts of TEDCO's announcement archive were inaccessible. An exhaustive historical claim needs TEDCO's complete recipient export, including program, legal recipient identity, award date, and source/record identifier.

## Sources and coverage

The packaged roster has 578 consolidated company identities, 226 tagged LifeTech adjacent, 184 distinct recipient-evidence URLs, and six existing directory matches. Thirteen LifeTech classifications are explicitly inferred from the published company name. Counts refer to this reviewed artifact, not to a completed production registration.

- [Archived TEDCO FY2007 annual report](https://msa.maryland.gov/megafile/msa/speccol/sc5300/sc5339/000113/011000/011069/unrestricted/20080537e.pdf) and [FY2008 report](https://msa.maryland.gov/megafile/msa/speccol/sc5300/sc5339/000113/011000/011070/unrestricted/20080538e.pdf): named MTTF, working-capital, Army/Fort Detrick and commercialization success stories, including exited historical companies.

- [TEDCO's full MII Company Formation awardee roster](https://www.tedcomd.com/mii/company-formation-awardees): 118 named company entries reviewed, with product descriptions used for classification. This is separate from TEDCO's explicitly selected web portfolio gallery.
- Official Maryland Department of Legislative Services TEDCO annual filings: FY2009–FY2017 and FY2019–FY2025 reviewed. Named portfolio tables from FY2019/FY2020 and annual qualified-business investment tables from FY2021–FY2024 provide the bulk of historical and annual investment coverage. FY2018 was unavailable at the expected DLS URL. The FY2025 filing reviewed did not contain the referenced Appendix B roster.
- [FY2017 Maryland Venture Fund portfolio](https://www.tedcomd.com/sites/default/files/2019-01/InvestMaryland%20Annual%20Report%202017.pdf) and [FY2018 portfolio](https://www.tedcomd.com/sites/default/files/2019-01/InvestMaryland%20Annual%20Report%202018%20-%20Final.pdf): named positive-investment positions, including legacy investments that can predate TEDCO's administration. Zero-dollar positions do not establish a new investment.
- Official MSCRF annual reports FY2007–FY2025 reviewed for corporate grantees and company awardee rosters. Academic investigators, suppliers, and companies described solely as university research collaborators are excluded unless separate evidence establishes company support.
- TEDCO quarterly/biannual reports available for 2019–2024 cross-checked. A filing filename's year/quarter is not presumed to be its reporting period.
- TEDCO's announcement archives and individual recipient announcements through October 5, 2026, including Seed, Venture, Inclusion/Builder, Rural Business Innovation Initiative, Concept Capital, SBIR/STTR matching and commercialization programs. Per-company source URLs and periods are retained in the review artifact. This is not a claim that every archived announcement was accessible or completely inventoried.
- The [2025 Expo program, page 31](https://www.tedcomd.com/sites/default/files/2025-10/Expo%202025%20Program%20Book-FINAL..pdf#page=31) explicitly names four BRIDGE participants receiving capital-readiness assistance. These records are services, not investment awards.

## Identity and classification review

Legal suffixes, punctuation, clear OCR errors and documented former/DBA names are consolidated. Existing directory matches were reviewed against a fresh **remote** replication snapshot. Import inputs explicitly name an existing organization ID where matched; the server refuses a new record that duplicates an existing exact name or website. Similar-looking names alone are not production identity matches. Separate corporate recipients, such as Orgenesis and Orgenesis Maryland, remain separate.

Examples of primary identity evidence include [BlueStar Telehealth's terms](https://bluestartelehealth.com/terms-of-use/) naming Blue Star Service Solutions and [HCIactive's company profile](https://www.linkedin.com/company/healthcareinteractive) identifying Healthcare Interactive. Source-reported aliases and existing matches are reviewable in the companion JSON.

`LifeTech adjacent` covers healthcare delivery/software, clinical diagnostics, devices, therapeutics, biomedical research, regenerative medicine, veterinary/animal health and biotechnology. Nutrition, workplace wellbeing, plant-pathogen biotechnology and environmental DNA research can be adjacent; this tag is not a claim that the company makes a clinical product. General battery/security/advice platforms are not tagged merely because healthcare is one possible customer market.

Each classification records its reason, basis and source. A small subset is explicitly marked **inferred from published company name**, rather than verified against a product description. Absence of a tag means no supported classification in this review; it is not proof that the company has no health relevance. Public descriptions are short original summaries; copied article prose is not published.

## Registration and financial meaning

Each recipient receives one consolidated sourced support relationship. Amounts are left null: portfolio totals, program maxima, funding-round totals, follow-on announcements and matching requirements are not silently added as individual cash transfers. Awards are `reported`; this does not assert settlement or current operation. All cited supporting sources remain in the record notes and review artifact.

On TEDCO's page, an authorized OrgPortal operator can preview the researched import, review every resolved identity, resulting tag and support record, then confirm. The API is `POST /api/network/orgs/:organizationId/support/import`, with a maximum of 25 recipients per batch. It requires the current user's operator permission, live source-organization management permission and the existing actor-bound, expiring, one-use preview receipt. Each batch is atomic, audited and idempotent by source organization and reviewed recipient key. It does not grant ownership, membership or transfer funds. Failures stop later batches; a new preview can safely resume already-applied recipients.

Do not use direct production SQL, a calendar-feed token, an assumed owner identity or a local replica to apply this research. Real changes happen on the remote primary through the authorized portal interface. Once registered, the existing replication system distributes the public organization and support data to replicas.

Verification includes importing the entire packaged roster into an isolated writable fixture, existing-tag preservation, identity/receipt enforcement, rollback on audit failure, all descendant tags, 500-plus evidence pagination, and frontend batch/filter behavior. A production release of the research and import UI is not proof that the directory import has been applied.
