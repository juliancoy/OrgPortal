-- External government observations, including unidentified recipients.
-- Organization links may be absent; no settlement or account balance is implied.
CREATE TABLE government_award_records (
 id TEXT PRIMARY KEY,
 award_identifier TEXT NOT NULL,
 agency_label TEXT NOT NULL,
 recipient_label TEXT NOT NULL,
 recipient_uei TEXT,
 recipient_identity TEXT NOT NULL CHECK(recipient_identity IN ('identified','unidentified')),
 from_organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
 to_organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
 amount_cents INTEGER NOT NULL,
 occurred_at TEXT NOT NULL,
 retrieved_at TEXT NOT NULL,
 source_modified_at TEXT,
 period_start TEXT NOT NULL,
 period_end TEXT NOT NULL,
 source_url TEXT NOT NULL,
 description TEXT NOT NULL,
 notes TEXT NOT NULL,
 provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json))
);
CREATE INDEX government_awards_recipient ON government_award_records(recipient_identity);
CREATE VIEW government_award_summary AS SELECT recipient_identity,
 count(*) AS record_count, sum(amount_cents) / 100.0 AS net_obligations_usd,
 sum(CASE WHEN amount_cents>0 THEN amount_cents ELSE 0 END)/100.0 AS positive_obligations_usd,
 sum(CASE WHEN amount_cents<0 THEN amount_cents ELSE 0 END)/100.0 AS negative_obligations_usd
FROM government_award_records GROUP BY recipient_identity;
DROP VIEW master_transaction_records;
CREATE VIEW master_transaction_records_existing AS SELECT m.*,
 f.fact_type AS financial_fact_type, f.scope AS financial_scope,
 f.measurement AS financial_measurement, f.fiscal_year, f.fiscal_year_basis,
 f.period_start, f.period_end, f.reporting_date,
 f.administering_agency_id, f.program_organization_id, f.fund_organization_id,
 f.account_organization_id, f.award_id, a.award_identifier, a.recipient_uei,
 a.assistance_listing_number, f.included_in_fact_id, f.supersedes_fact_id
FROM master_transaction_records_base m
LEFT JOIN funding_facts f ON m.record_type='organization_support' AND f.support_record_id=m.record_id
LEFT JOIN funding_awards a ON a.id=f.award_id;

CREATE VIEW master_transaction_records AS
SELECT * FROM master_transaction_records_existing
UNION ALL
SELECT g.id, g.id, 'government_award', g.retrieved_at, g.occurred_at,
 'obligation', g.amount_cents/100.0, 'USD', 'cumulative obligations', NULL, NULL,
 g.description, NULL, NULL, g.agency_label, g.recipient_label,
 g.from_organization_id, g.to_organization_id, fo.slug, tor.slug,
 'reported', NULL, g.source_url, 'USAspending official API', g.notes, g.provenance_json, '[]',
 'obligation', 'award', 'cumulative', NULL, NULL,
 g.period_start, g.period_end, g.source_modified_at,
 g.from_organization_id, NULL, NULL, NULL, g.id, g.award_identifier, g.recipient_uei,
 NULL, NULL, NULL
FROM government_award_records g
LEFT JOIN organizations fo ON fo.id=g.from_organization_id
LEFT JOIN organizations tor ON tor.id=g.to_organization_id;
