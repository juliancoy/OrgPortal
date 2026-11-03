-- Shared public financial source observations. No balances or inferred identities.
CREATE TABLE external_financial_observations (
 id TEXT PRIMARY KEY,
 source_system TEXT NOT NULL CHECK(length(source_system) BETWEEN 1 AND 100),
 dataset TEXT NOT NULL CHECK(length(dataset) BETWEEN 1 AND 100),
 external_id TEXT NOT NULL,
 agency_label TEXT NOT NULL,
 recipient_label TEXT NOT NULL,
 occurred_at TEXT NOT NULL,
 amount_cents INTEGER NOT NULL,
 currency TEXT NOT NULL CHECK(length(currency)=3),
 measurement TEXT NOT NULL CHECK(measurement IN ('delta','period_total','cumulative','snapshot','ceiling','not_applicable')),
 fact_type TEXT NOT NULL CHECK(fact_type IN ('reported_award','disbursement','obligation','appropriation','program_ceiling','agency_expenditure','balance','rescission','administration')),
 notes TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL,
 source_url TEXT NOT NULL,
 metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json) AND json_type(metadata_json)='object'),
 retrieved_at TEXT NOT NULL,
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64)
);
CREATE INDEX external_financial_source_date ON external_financial_observations(source_system,dataset,occurred_at,id);
-- A source correction must be reviewed; replay of an unchanged row is harmless.
CREATE TRIGGER external_financial_observation_immutable BEFORE UPDATE ON external_financial_observations
WHEN NEW.amount_cents != OLD.amount_cents OR NEW.agency_label != OLD.agency_label
 OR NEW.recipient_label != OLD.recipient_label OR NEW.occurred_at != OLD.occurred_at
 OR NEW.metadata_json != OLD.metadata_json OR NEW.description != OLD.description
 OR NEW.source_system != OLD.source_system OR NEW.dataset != OLD.dataset OR NEW.external_id != OLD.external_id
 OR NEW.currency != OLD.currency OR NEW.measurement != OLD.measurement OR NEW.notes != OLD.notes
 OR NEW.fact_type != OLD.fact_type OR NEW.source_url != OLD.source_url
BEGIN SELECT RAISE(ABORT,'External financial source correction requires explicit review'); END;
CREATE VIEW master_transaction_records_before_external_observations AS
SELECT * FROM master_transaction_records_before_nonprofits
UNION ALL
SELECT g.id,g.id,'nonprofit_grant',f.retrieved_at,f.period_end,g.kind,
 g.amount_cents/100.0,'USD',CASE WHEN g.kind='terms' THEN 'approved for future payment' ELSE 'annual grant disclosure' END,NULL,NULL,
 g.description,NULL,NULL,f.name,g.recipient_name,g.from_organization_id,g.to_organization_id,fo.slug,tor.slug,
 'reported',NULL,g.source_url,'IRS Form 990 XML',g.notes,g.provenance_json,'[]',
 CASE WHEN g.grant_status='paid' THEN 'disbursement' ELSE 'reported_award' END,'institution','period_total',NULL,NULL,
 f.period_start,f.period_end,f.filed_at,g.from_organization_id,NULL,NULL,NULL,g.id,NULL,NULL,NULL,NULL,NULL
FROM nonprofit_grant_records g JOIN nonprofit_filing_records f ON f.id=g.filing_id
LEFT JOIN organizations fo ON fo.id=g.from_organization_id
LEFT JOIN organizations tor ON tor.id=g.to_organization_id
WHERE f.selected=1;

DROP VIEW master_transaction_records;
CREATE VIEW master_transaction_records AS
SELECT * FROM master_transaction_records_before_external_observations
UNION ALL
SELECT m.id,m.id,'external_financial_observation',m.retrieved_at,m.occurred_at,
 m.fact_type,m.amount_cents/100.0,m.currency,CASE WHEN m.source_system='maryland_comptroller' AND m.dataset='bpw' THEN 'BPW approval; not payment' WHEN m.source_system='maryland_comptroller' AND m.dataset='mdview' THEN 'MD-VIEW payment total' ELSE m.fact_type END,NULL,NULL,
 m.description,NULL,NULL,m.agency_label,m.recipient_label,NULL,NULL,NULL,NULL,
 'reported',NULL,m.source_url,m.source_system,m.notes,
 m.metadata_json,'[]',m.fact_type,'award',m.measurement,NULL,
 CASE WHEN m.source_system='maryland_comptroller' THEN 'maryland' ELSE NULL END,
 NULL,NULL,m.occurred_at,NULL,NULL,NULL,NULL,m.id,m.external_id,NULL,NULL,NULL,NULL
FROM external_financial_observations m;
-- Public payee names can identify people. Keep these correctable source rows
-- out of the immutable journal; refresh them through the reviewed import API.
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('external_financial_observations','public financial source observations; annual review and correction/deletion; excluded from immutable history');
