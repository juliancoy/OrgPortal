CREATE TABLE IF NOT EXISTS ledger_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL DEFAULT 'individual',
  balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_email ON ledger_accounts(email);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_balance ON ledger_accounts(balance);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id TEXT PRIMARY KEY,
  from_account_id TEXT REFERENCES ledger_accounts(id) ON DELETE SET NULL,
  to_account_id TEXT REFERENCES ledger_accounts(id) ON DELETE SET NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'DEM',
  transaction_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_timestamp ON ledger_transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_from ON ledger_transactions(from_account_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_to ON ledger_transactions(to_account_id, timestamp);

CREATE TABLE IF NOT EXISTS ubi_runtime_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  interval_seconds INTEGER NOT NULL DEFAULT 60,
  dena_annual REAL NOT NULL DEFAULT 1,
  dena_precision INTEGER NOT NULL DEFAULT 6,
  entity_types TEXT NOT NULL DEFAULT '["individual"]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS ubi_eligibility (
  account_id TEXT PRIMARY KEY REFERENCES ledger_accounts(id) ON DELETE CASCADE,
  is_eligible INTEGER NOT NULL DEFAULT 1,
  next_payment_date TEXT,
  last_payment_amount REAL NOT NULL DEFAULT 0,
  total_payments_received REAL NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO ubi_runtime_settings (id, interval_seconds, dena_annual, dena_precision, entity_types, updated_by)
VALUES (1, 60, 1, 6, '["individual"]', 'migration');

INSERT OR IGNORE INTO ledger_accounts (id, user_id, name, email, entity_type, balance, created_at, updated_at) VALUES
  ('acct-alice', 'user-alice', 'Alice Johnson', 'alice@example.test', 'individual', 1200, '2026-06-01T12:00:00.000Z', '2026-06-07T12:00:00.000Z'),
  ('acct-bob', 'user-bob', 'Bob Smith', 'bob@example.test', 'individual', 980, '2026-06-01T12:00:00.000Z', '2026-06-07T12:00:00.000Z'),
  ('acct-civic-fund', NULL, 'Civic Fund', 'fund@example.test', 'nonprofit', 50000, '2026-06-01T12:00:00.000Z', '2026-06-07T12:00:00.000Z'),
  ('acct-code-collective', NULL, 'Code Collective', 'hello@codecollective.us', 'nonprofit', 25000, '2026-06-01T12:00:00.000Z', '2026-06-07T12:00:00.000Z');

INSERT OR IGNORE INTO ledger_transactions (id, from_account_id, to_account_id, amount, currency, transaction_type, description, timestamp) VALUES
  ('txn-seed-alice', NULL, 'acct-alice', 1200, 'DEM', 'grant', 'Initial Cloudflare ledger grant', '2026-06-01T12:00:00.000Z'),
  ('txn-seed-bob', NULL, 'acct-bob', 980, 'DEM', 'grant', 'Initial Cloudflare ledger grant', '2026-06-01T12:10:00.000Z'),
  ('txn-seed-fund', NULL, 'acct-civic-fund', 50000, 'DEM', 'grant', 'Initial Cloudflare ledger grant', '2026-06-01T12:20:00.000Z'),
  ('txn-seed-code-collective', NULL, 'acct-code-collective', 25000, 'DEM', 'grant', 'Initial Cloudflare ledger grant', '2026-06-01T12:30:00.000Z');

INSERT OR IGNORE INTO ubi_eligibility (account_id, is_eligible, next_payment_date, last_payment_amount, total_payments_received)
VALUES
  ('acct-alice', 1, '2026-06-08', 0, 0),
  ('acct-bob', 1, '2026-06-08', 0, 0);
