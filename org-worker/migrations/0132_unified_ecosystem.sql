-- Public graph evidence lives in the same transactional DB as native support.
-- Versioned staging prevents partially imported graphs from becoming visible.
CREATE TABLE ecosystem_public_datasets (
 id TEXT PRIMARY KEY CHECK(length(id)=64),
 state TEXT NOT NULL CHECK(state IN ('staging','active','archived')),
 created_at TEXT NOT NULL,
 activated_at TEXT
);
CREATE UNIQUE INDEX ecosystem_one_active_dataset ON ecosystem_public_datasets(state) WHERE state='active';
CREATE TABLE ecosystem_public_records (
 dataset_id TEXT NOT NULL REFERENCES ecosystem_public_datasets(id) ON DELETE CASCADE,
 collection TEXT NOT NULL CHECK(collection IN ('organizations','relationships','financing','events','nonprofitProfiles','performanceRecords','performanceAssessments','metadata','positions')),
 record_key TEXT NOT NULL CHECK(length(record_key)=64),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 PRIMARY KEY(dataset_id,collection,record_key)
);
CREATE INDEX ecosystem_public_record_identity ON ecosystem_public_records(dataset_id,collection,json_extract(payload_json,'$.id'));
CREATE TRIGGER ecosystem_public_no_active_insert BEFORE INSERT ON ecosystem_public_records
WHEN (SELECT state FROM ecosystem_public_datasets WHERE id=NEW.dataset_id)!='staging'
BEGIN SELECT RAISE(ABORT,'Published graph records require a new reviewed dataset'); END;
CREATE TRIGGER ecosystem_public_no_update BEFORE UPDATE ON ecosystem_public_records
BEGIN SELECT RAISE(ABORT,'Graph source correction requires a new reviewed dataset'); END;
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('ecosystem_public_datasets','public source evidence; annual manual review; correction/deletion cascades; no immutable personal history'),
 ('ecosystem_public_records','public graph source records; annual manual review; cascade deletion and regenerate caches/backups');
CREATE VIEW master_transaction_records_before_ecosystem AS
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

DROP VIEW master_transaction_records;
CREATE VIEW master_transaction_records AS
SELECT * FROM master_transaction_records_before_ecosystem
UNION ALL
SELECT 'ecosystem:' || r.record_key,json_extract(r.payload_json,'$.id'),'ecosystem_relationship',d.activated_at,
 COALESCE(json_extract(r.payload_json,'$.date'),''),COALESCE(json_extract(r.payload_json,'$.kind'),json_extract(r.payload_json,'$.relationship')),
 json_extract(r.payload_json,'$.amount'),json_extract(r.payload_json,'$.currency'),COALESCE(json_extract(r.payload_json,'$.amountLabel'),''),
 json_extract(r.payload_json,'$.quantity'),json_extract(r.payload_json,'$.unit'),
 COALESCE(json_extract(r.payload_json,'$.description'),json_extract(r.payload_json,'$.type'),''),NULL,NULL,
 COALESCE(json_extract(r.payload_json,'$.sourceLabel'),''),COALESCE(json_extract(r.payload_json,'$.targetLabel'),''),
 NULL,NULL,NULL,NULL,COALESCE(json_extract(r.payload_json,'$.status'),'reported'),NULL,
 COALESCE(json_extract(r.payload_json,'$.sourceUrl'),''),COALESCE(json_extract(r.payload_json,'$.evidence'),''),COALESCE(json_extract(r.payload_json,'$.notes'),''),
 COALESCE(json_extract(r.payload_json,'$.provenance'),'{}'),'[]',
 json_extract(r.payload_json,'$.financialFactType'),NULL,json_extract(r.payload_json,'$.financialMeasure'),NULL,NULL,
 json_extract(r.payload_json,'$.periodStart'),json_extract(r.payload_json,'$.periodEnd'),NULL,NULL,NULL,NULL,NULL,
 json_extract(r.payload_json,'$.awardKey'),NULL,NULL,NULL,NULL,NULL
FROM ecosystem_public_records r JOIN ecosystem_public_datasets d ON d.id=r.dataset_id AND d.state='active'
WHERE r.collection='relationships'
 AND NOT EXISTS(SELECT 1 FROM organization_support_records m WHERE m.id IN
 (json_extract(r.payload_json,'$.id'),'bmoremedtech:' || json_extract(r.payload_json,'$.id'),'bmoremedtech:' || json_extract(r.payload_json,'$.financingId')))
 AND NOT EXISTS(SELECT 1 FROM nonprofit_grant_records n WHERE n.id=json_extract(r.payload_json,'$.id'));
