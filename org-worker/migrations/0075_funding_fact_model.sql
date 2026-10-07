-- Flat public funding evidence, independent of internal ledger settlement.
CREATE TABLE funding_entities (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
 entity_type TEXT NOT NULL CHECK(entity_type IN ('government','agency','statutory_fund','program','appropriation_account','funding_opportunity')),
 administering_organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
 legal_entity_organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
 treasury_account_symbol TEXT,
 source_url TEXT NOT NULL,
 evidence TEXT NOT NULL,
 reviewed_at TEXT NOT NULL
);
CREATE INDEX funding_entities_admin ON funding_entities(administering_organization_id,entity_type);
CREATE TABLE funding_awards (
 id TEXT PRIMARY KEY,
 awarding_agency_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 award_identifier TEXT NOT NULL CHECK(length(trim(award_identifier))>0),
 recipient_organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
 recipient_uei TEXT CHECK(recipient_uei IS NULL OR length(recipient_uei)=12),
 assistance_listing_number TEXT,
 source_url TEXT NOT NULL,
 evidence TEXT NOT NULL,
 UNIQUE(awarding_agency_id,award_identifier)
);
CREATE TABLE funding_facts (
 id TEXT PRIMARY KEY,
 support_record_id TEXT UNIQUE REFERENCES organization_support_records(id) ON DELETE RESTRICT,
 fact_type TEXT NOT NULL CHECK(fact_type IN ('reported_award','program_ceiling','appropriation','obligation','disbursement','balance','rescission','agency_expenditure','administration')),
 scope TEXT NOT NULL CHECK(scope IN ('agency','fund','program','account','award','institution')),
 amount REAL,
 currency TEXT,
 measurement TEXT NOT NULL CHECK(measurement IN ('period_total','cumulative','delta','snapshot','ceiling','not_applicable')),
 fiscal_year INTEGER CHECK(fiscal_year IS NULL OR fiscal_year BETWEEN 1900 AND 2200),
 fiscal_year_basis TEXT CHECK(fiscal_year_basis IS NULL OR fiscal_year_basis IN ('federal','maryland','source_unspecified')),
 period_start TEXT,
 period_end TEXT,
 reporting_date TEXT,
 administering_agency_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
 program_organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
 fund_organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
 account_organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
 award_id TEXT REFERENCES funding_awards(id) ON DELETE RESTRICT,
 included_in_fact_id TEXT REFERENCES funding_facts(id) DEFERRABLE INITIALLY DEFERRED,
 supersedes_fact_id TEXT REFERENCES funding_facts(id) DEFERRABLE INITIALLY DEFERRED,
 source_url TEXT NOT NULL,
 evidence TEXT NOT NULL,
 reviewed_at TEXT NOT NULL,
 CHECK((amount IS NULL AND currency IS NULL) OR (amount IS NOT NULL AND length(currency)=3)),
 CHECK(fact_type != 'administration' OR amount IS NULL),
 CHECK(fact_type NOT IN ('program_ceiling','appropriation','balance','rescission') OR amount IS NULL OR amount>=0),
 CHECK(included_in_fact_id IS NULL OR included_in_fact_id != id),
 CHECK(supersedes_fact_id IS NULL OR supersedes_fact_id != id),
 CHECK(period_start IS NULL OR period_end IS NULL OR period_start<=period_end)
);
CREATE INDEX funding_facts_type_year ON funding_facts(fact_type,fiscal_year);
CREATE INDEX funding_facts_program ON funding_facts(program_organization_id,fact_type);
CREATE INDEX funding_facts_fund ON funding_facts(fund_organization_id,fact_type);
CREATE INDEX funding_facts_award ON funding_facts(award_id,fact_type,reporting_date);
CREATE TRIGGER funding_fact_entity_types_insert BEFORE INSERT ON funding_facts
WHEN (NEW.program_organization_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM funding_entities WHERE organization_id=NEW.program_organization_id AND entity_type IN ('program','funding_opportunity')))
 OR (NEW.fund_organization_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM funding_entities WHERE organization_id=NEW.fund_organization_id AND entity_type='statutory_fund'))
 OR (NEW.account_organization_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM funding_entities WHERE organization_id=NEW.account_organization_id AND entity_type='appropriation_account'))
 OR (NEW.administering_agency_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM funding_entities WHERE organization_id=NEW.administering_agency_id AND entity_type='agency'))
BEGIN SELECT RAISE(ABORT,'Funding fact references must match entity types'); END;
CREATE TRIGGER funding_facts_cycle_supersedes_fact_id_insert BEFORE INSERT ON funding_facts
WHEN NEW.supersedes_fact_id IS NOT NULL AND EXISTS(
 WITH RECURSIVE chain(id) AS (SELECT NEW.supersedes_fact_id UNION SELECT f.supersedes_fact_id FROM funding_facts f JOIN chain c ON c.id=f.id WHERE f.supersedes_fact_id IS NOT NULL)
 SELECT 1 FROM chain WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'Funding fact reconciliation links cannot form cycles'); END;
CREATE TRIGGER funding_facts_cycle_included_in_fact_id_insert BEFORE INSERT ON funding_facts
WHEN NEW.included_in_fact_id IS NOT NULL AND EXISTS(
 WITH RECURSIVE chain(id) AS (SELECT NEW.included_in_fact_id UNION SELECT f.included_in_fact_id FROM funding_facts f JOIN chain c ON c.id=f.id WHERE f.included_in_fact_id IS NOT NULL)
 SELECT 1 FROM chain WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'Funding fact reconciliation links cannot form cycles'); END;
CREATE TRIGGER funding_fact_entity_types_update BEFORE UPDATE ON funding_facts
WHEN (NEW.program_organization_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM funding_entities WHERE organization_id=NEW.program_organization_id AND entity_type IN ('program','funding_opportunity')))
 OR (NEW.fund_organization_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM funding_entities WHERE organization_id=NEW.fund_organization_id AND entity_type='statutory_fund'))
 OR (NEW.account_organization_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM funding_entities WHERE organization_id=NEW.account_organization_id AND entity_type='appropriation_account'))
 OR (NEW.administering_agency_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM funding_entities WHERE organization_id=NEW.administering_agency_id AND entity_type='agency'))
BEGIN SELECT RAISE(ABORT,'Funding fact references must match entity types'); END;
CREATE TRIGGER funding_facts_cycle_supersedes_fact_id_update BEFORE UPDATE ON funding_facts
WHEN NEW.supersedes_fact_id IS NOT NULL AND EXISTS(
 WITH RECURSIVE chain(id) AS (SELECT NEW.supersedes_fact_id UNION SELECT f.supersedes_fact_id FROM funding_facts f JOIN chain c ON c.id=f.id WHERE f.supersedes_fact_id IS NOT NULL)
 SELECT 1 FROM chain WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'Funding fact reconciliation links cannot form cycles'); END;
CREATE TRIGGER funding_facts_cycle_included_in_fact_id_update BEFORE UPDATE ON funding_facts
WHEN NEW.included_in_fact_id IS NOT NULL AND EXISTS(
 WITH RECURSIVE chain(id) AS (SELECT NEW.included_in_fact_id UNION SELECT f.included_in_fact_id FROM funding_facts f JOIN chain c ON c.id=f.id WHERE f.included_in_fact_id IS NOT NULL)
 SELECT 1 FROM chain WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'Funding fact reconciliation links cannot form cycles'); END;
-- Linked facts retain the exact existing support amount, including unknowns.
CREATE TRIGGER funding_facts_amount_insert BEFORE INSERT ON funding_facts
WHEN NEW.support_record_id IS NOT NULL AND EXISTS(
 SELECT 1 FROM organization_support_records WHERE id=NEW.support_record_id
 AND (amount IS NOT NEW.amount OR currency IS NOT NEW.currency))
BEGIN SELECT RAISE(ABORT,'Funding fact amount must match support evidence'); END;
CREATE TRIGGER funding_facts_amount_update BEFORE UPDATE OF amount,currency,support_record_id ON funding_facts
WHEN NEW.support_record_id IS NOT NULL AND EXISTS(
 SELECT 1 FROM organization_support_records WHERE id=NEW.support_record_id
 AND (amount IS NOT NEW.amount OR currency IS NOT NEW.currency))
BEGIN SELECT RAISE(ABORT,'Funding fact amount must match support evidence'); END;
CREATE TRIGGER funding_support_amount_update BEFORE UPDATE OF amount,currency ON organization_support_records
WHEN EXISTS(SELECT 1 FROM funding_facts WHERE support_record_id=NEW.id
 AND (amount IS NOT NEW.amount OR currency IS NOT NEW.currency))
BEGIN SELECT RAISE(ABORT,'Published funding evidence is immutable; add a superseding fact'); END;
-- These are observations, not sums: cumulative snapshots need reconciliation.
CREATE VIEW current_funding_facts AS SELECT f.* FROM funding_facts f
LEFT JOIN organization_support_records s ON s.id=f.support_record_id
WHERE (s.id IS NULL OR s.status!='voided') AND NOT EXISTS(
 SELECT 1 FROM funding_facts successor LEFT JOIN organization_support_records ss ON ss.id=successor.support_record_id
 WHERE successor.supersedes_fact_id=f.id AND (ss.id IS NULL OR ss.status!='voided'));
CREATE VIEW funding_appropriations AS SELECT * FROM current_funding_facts WHERE fact_type='appropriation';
CREATE VIEW funding_obligations AS SELECT * FROM current_funding_facts WHERE fact_type='obligation';
CREATE VIEW funding_disbursements AS SELECT * FROM current_funding_facts WHERE fact_type='disbursement';
CREATE VIEW funding_reported_awards AS SELECT * FROM current_funding_facts WHERE fact_type='reported_award';
CREATE VIEW funding_balances AS SELECT * FROM current_funding_facts WHERE fact_type='balance';
DROP VIEW master_transaction_records;
CREATE VIEW master_transaction_records_base AS
SELECT 'ledger:' || t.id AS id, t.id AS record_id, 'ledger' AS record_type,
  t.timestamp AS timestamp, t.timestamp AS occurred_at, t.transaction_type,
  t.amount, t.currency, '' AS amount_label, NULL AS quantity, NULL AS unit,
  t.description, t.from_account_id, t.to_account_id,
  fa.name AS from_label, ta.name AS to_label,
  NULL AS from_organization_id, NULL AS to_organization_id,
  NULL AS from_organization_slug, NULL AS to_organization_slug,
  'settled' AS status, NULL AS void_reason, '' AS source_url, '' AS evidence, '' AS notes, '[]' AS provenance_json, '[]' AS tags_json
FROM ledger_transactions t
LEFT JOIN ledger_accounts fa ON fa.id = t.from_account_id
LEFT JOIN ledger_accounts ta ON ta.id = t.to_account_id
UNION ALL
SELECT 'support:' || s.id, s.id, 'organization_support', s.created_at, s.occurred_at,
  s.support_kind, s.amount, s.currency, s.amount_label, s.quantity, s.unit,
  s.description, NULL, NULL, s.from_label, s.to_label,
  s.from_organization_id, s.to_organization_id, fo.slug, tor.slug,
  s.status, s.void_reason, s.source_url, s.evidence, s.notes, s.provenance_json, '[]'
FROM organization_support_records s
LEFT JOIN organizations fo ON fo.id = s.from_organization_id
LEFT JOIN organizations tor ON tor.id = s.to_organization_id
UNION ALL
SELECT 'financing:' || e.id, e.id, 'company_financing', e.updated_at, e.occurred_at,
 e.event_type, e.amount, e.currency, e.amount_qualifier, NULL, NULL, e.label,
 NULL, NULL, COALESCE(o.name,'Multiple investors'), r.name,
 e.agency_id, r.organization_id, o.slug, tor.slug,
 'reported', NULL, json_extract(e.sources_json,'$[0]'), '',
 e.notes || CASE WHEN e.included_in_event_id IS NOT NULL THEN ' Included in event: ' || e.included_in_event_id ELSE '' END,
 e.sources_json, e.tags_json
FROM financing_events e
JOIN financing_recipients r ON r.id=e.recipient_id
LEFT JOIN organizations o ON o.id=e.agency_id
LEFT JOIN organizations tor ON tor.id=r.organization_id;
CREATE VIEW master_transaction_records AS SELECT m.*,
 f.fact_type AS financial_fact_type, f.scope AS financial_scope,
 f.measurement AS financial_measurement, f.fiscal_year, f.fiscal_year_basis,
 f.period_start, f.period_end, f.reporting_date,
 f.administering_agency_id, f.program_organization_id, f.fund_organization_id,
 f.account_organization_id, f.award_id, a.award_identifier, a.recipient_uei,
 a.assistance_listing_number, f.included_in_fact_id, f.supersedes_fact_id
FROM master_transaction_records_base m
LEFT JOIN funding_facts f ON m.record_type='organization_support' AND f.support_record_id=m.record_id
LEFT JOIN funding_awards a ON a.id=f.award_id;
