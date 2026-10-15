-- Public organization financial statements and grant disclosures, not bank settlements.
CREATE TABLE nonprofit_filing_records (
 id TEXT PRIMARY KEY, ein TEXT NOT NULL CHECK(length(ein)=9), name TEXT NOT NULL,
 form_type TEXT NOT NULL CHECK(form_type IN ('990','990PF')),
 period_start TEXT NOT NULL, period_end TEXT NOT NULL, filed_at TEXT NOT NULL,
 amended INTEGER NOT NULL CHECK(amended IN (0,1)), selected INTEGER NOT NULL CHECK(selected IN (0,1)),
 accounting_basis TEXT NOT NULL, revenue_cents INTEGER, expenses_cents INTEGER,
 assets_cents INTEGER, liabilities_cents INTEGER, source_url TEXT NOT NULL,
 archive_url TEXT NOT NULL, source_sha256 TEXT NOT NULL, retrieved_at TEXT NOT NULL
);
CREATE TRIGGER nonprofit_filing_source_immutable BEFORE UPDATE OF source_sha256 ON nonprofit_filing_records
WHEN NEW.source_sha256!=OLD.source_sha256
BEGIN SELECT RAISE(ABORT,'IRS filing object checksum changed; review source correction'); END;
CREATE UNIQUE INDEX nonprofit_filing_selected ON nonprofit_filing_records(ein,period_end,form_type) WHERE selected=1;
CREATE TABLE nonprofit_grant_records (
 id TEXT PRIMARY KEY, filing_id TEXT NOT NULL REFERENCES nonprofit_filing_records(id),
 recipient_ein TEXT, recipient_name TEXT NOT NULL,
 recipient_identity TEXT NOT NULL CHECK(recipient_identity IN ('identified','name_only','unidentified')),
 amount_cents INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('transfer','terms','in_kind')),
 grant_status TEXT NOT NULL CHECK(grant_status IN ('paid','reported','approved_future')),
 from_organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
 to_organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
 source_url TEXT NOT NULL, description TEXT NOT NULL, notes TEXT NOT NULL,
 provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json))
);
CREATE INDEX nonprofit_grants_filing ON nonprofit_grant_records(filing_id);
CREATE VIEW nonprofit_grant_summary AS SELECT f.ein,f.period_start,f.period_end,g.recipient_identity,g.kind,g.grant_status,
 count(*) AS record_count,sum(g.amount_cents)/100.0 AS amount_usd
FROM nonprofit_grant_records g JOIN nonprofit_filing_records f ON f.id=g.filing_id
WHERE f.selected=1 GROUP BY f.ein,f.period_start,f.period_end,g.recipient_identity,g.kind,g.grant_status;
DROP VIEW master_transaction_records;
CREATE VIEW master_transaction_records_before_nonprofits AS
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

CREATE VIEW master_transaction_records AS
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
