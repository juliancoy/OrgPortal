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
CREATE INDEX federal_public_cursor ON external_financial_observations(source_system,id);
CREATE INDEX federal_year_totals ON external_financial_observations(source_system,dataset,CAST(CAST(substr(occurred_at,1,4) AS INTEGER)+(substr(occurred_at,6,2)>='10') AS TEXT),amount_cents,occurred_at);
CREATE INDEX federal_source_checksums ON external_financial_observations(source_system,source_sha256);
CREATE INDEX federal_recipient_identity ON external_financial_observations(recipient_label,json_extract(metadata_json,'$.recipient_uei')) WHERE source_system='usaspending';
CREATE INDEX federal_agency_identity ON external_financial_observations(agency_label,json_extract(metadata_json,'$.awarding_agency_code')) WHERE source_system='usaspending';
-- Atomic data receipt; no account identity or financial payload copied here.
CREATE TABLE federal_import_receipts(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,recorded INTEGER NOT NULL,existing INTEGER NOT NULL,source_hashes_json TEXT NOT NULL,created_at TEXT NOT NULL);
