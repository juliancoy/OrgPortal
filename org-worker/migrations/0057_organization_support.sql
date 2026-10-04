-- Evidence-backed organizational support. Recording external support does not
-- settle a payment or change the internal DEM money supply.
CREATE TABLE organization_support_records (
  id TEXT PRIMARY KEY,
  from_organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
  to_organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
  from_label TEXT NOT NULL,
  to_label TEXT NOT NULL,
  support_kind TEXT NOT NULL CHECK (support_kind IN
    ('transfer','in_kind','mentoring','venue','services','incubation','acceleration','collaboration','terms','capitalization','portfolio','coinvestment','affiliation')),
  amount REAL CHECK (amount IS NULL OR amount > 0),
  currency TEXT,
  amount_label TEXT NOT NULL DEFAULT '',
  quantity REAL CHECK (quantity IS NULL OR quantity > 0),
  unit TEXT,
  description TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  provenance_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(provenance_json)),
  status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','delivered','voided')),
  void_reason TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  CHECK (from_organization_id IS NULL OR to_organization_id IS NULL OR from_organization_id != to_organization_id),
  CHECK ((amount IS NULL AND currency IS NULL) OR (amount IS NOT NULL AND length(currency) = 3)),
  CHECK ((quantity IS NULL AND unit IS NULL) OR (quantity IS NOT NULL AND length(unit) > 0))
);
CREATE INDEX idx_support_from ON organization_support_records(from_organization_id, status, support_kind);
CREATE INDEX idx_support_to ON organization_support_records(to_organization_id, status, support_kind);
CREATE INDEX idx_support_created ON organization_support_records(created_at, id);

-- Only actual named recipients of support become descendants. Generic cohorts,
-- program terms, aggregates and affiliation retain their evidence as context.
CREATE VIEW organization_support_edges AS
SELECT DISTINCT from_organization_id, to_organization_id
FROM organization_support_records
WHERE status != 'voided' AND from_organization_id IS NOT NULL AND to_organization_id IS NOT NULL
  AND support_kind NOT IN ('terms','portfolio','coinvestment','affiliation');

-- One master record includes settlements and externally reported contributions.
-- Financial and nonfinancial records retain their units and source semantics.
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
LEFT JOIN organizations tor ON tor.id = s.to_organization_id;
