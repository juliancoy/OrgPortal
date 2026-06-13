CREATE TABLE IF NOT EXISTS organization_sentiments (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('favor', 'disfavor')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_sentiments_org ON organization_sentiments(organization_id, sentiment);
CREATE INDEX IF NOT EXISTS idx_organization_sentiments_user ON organization_sentiments(user_id);

INSERT OR IGNORE INTO ledger_accounts (id, user_id, name, email, entity_type, balance, created_at, updated_at)
SELECT
  'acct-user-' || user_id,
  user_id,
  COALESCE(NULLIF(user_name, ''), 'User'),
  COALESCE(NULLIF(lower(user_email), ''), user_id || '@local.codecollective'),
  'individual',
  0,
  COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM user_contact_pages
WHERE user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM ledger_accounts a
    WHERE lower(a.email) = COALESCE(NULLIF(lower(user_contact_pages.user_email), ''), user_contact_pages.user_id || '@local.codecollective')
  );

INSERT OR IGNORE INTO ubi_eligibility (account_id, is_eligible, next_payment_date, last_payment_amount, total_payments_received)
SELECT id, 1, date('now'), 0, 0
FROM ledger_accounts
WHERE lower(entity_type) = 'individual';
