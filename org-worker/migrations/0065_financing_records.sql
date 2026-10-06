-- Public evidence lives in the same transactional DB as the master ledger.
CREATE TABLE financing_recipients (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 organization_id TEXT,
 metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
 updated_at TEXT NOT NULL
);
CREATE INDEX financing_recipient_org ON financing_recipients(organization_id);
CREATE TABLE financing_agency_recipients (
 id TEXT PRIMARY KEY,
 agency_id TEXT NOT NULL REFERENCES organizations(id),
 recipient_id TEXT NOT NULL REFERENCES financing_recipients(id),
 research_json TEXT NOT NULL CHECK(json_valid(research_json)),
 audit_json TEXT NOT NULL CHECK(json_valid(audit_json)),
 reviewed_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(agency_id, recipient_id)
);
CREATE TABLE financing_events (
 id TEXT PRIMARY KEY,
 recipient_id TEXT NOT NULL REFERENCES financing_recipients(id),
 agency_id TEXT REFERENCES organizations(id),
 event_type TEXT NOT NULL CHECK(event_type IN ('agency','equity','debt','grant','acquisition','cumulative')),
 amount REAL NOT NULL CHECK(amount>0),
 currency TEXT NOT NULL CHECK(length(currency)=3),
 amount_qualifier TEXT NOT NULL CHECK(amount_qualifier IN ('exact','over','up-to')),
 occurred_at TEXT NOT NULL,
 label TEXT NOT NULL,
 investors_json TEXT NOT NULL CHECK(json_valid(investors_json)),
 sources_json TEXT NOT NULL CHECK(json_valid(sources_json)),
 notes TEXT NOT NULL,
 included_in_event_id TEXT REFERENCES financing_events(id) DEFERRABLE INITIALLY DEFERRED,
 updated_at TEXT NOT NULL
);
CREATE INDEX financing_events_recipient ON financing_events(recipient_id,event_type);
CREATE INDEX financing_events_agency ON financing_events(agency_id,event_type);
-- Include reported external financing in the existing master record. Whole
-- rounds and contributions retain different types and explicit inclusion links.
ALTER TABLE organization_replica_state ADD COLUMN financing_count INTEGER NOT NULL DEFAULT 0;

DROP VIEW master_transaction_records;
CREATE VIEW master_transaction_records AS
SELECT 'ledger:' || t.id AS id, t.id AS record_id, 'ledger' AS record_type,
  t.timestamp AS timestamp, t.timestamp AS occurred_at, t.transaction_type,
  t.amount, t.currency, '' AS amount_label, NULL AS quantity, NULL AS unit,
  t.description, t.from_account_id, t.to_account_id,
  fa.name AS from_label, ta.name AS to_label,
  NULL AS from_organization_id, NULL AS to_organization_id,
  NULL AS from_organization_slug, NULL AS to_organization_slug,
  'settled' AS status, NULL AS void_reason, '' AS source_url, '' AS evidence, '' AS notes, '[]' AS provenance_json
FROM ledger_transactions t
LEFT JOIN ledger_accounts fa ON fa.id = t.from_account_id
LEFT JOIN ledger_accounts ta ON ta.id = t.to_account_id
UNION ALL
SELECT 'support:' || s.id, s.id, 'organization_support', s.created_at, s.occurred_at,
  s.support_kind, s.amount, s.currency, s.amount_label, s.quantity, s.unit,
  s.description, NULL, NULL, s.from_label, s.to_label,
  s.from_organization_id, s.to_organization_id, fo.slug, tor.slug,
  s.status, s.void_reason, s.source_url, s.evidence, s.notes, s.provenance_json
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
 e.sources_json
FROM financing_events e
JOIN financing_recipients r ON r.id=e.recipient_id
LEFT JOIN organizations o ON o.id=e.agency_id
LEFT JOIN organizations tor ON tor.id=r.organization_id;
