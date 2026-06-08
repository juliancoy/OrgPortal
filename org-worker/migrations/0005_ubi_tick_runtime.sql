ALTER TABLE ledger_accounts
ADD COLUMN dena_balance REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ubi_tick_state (
  id TEXT PRIMARY KEY CHECK (id = 'singleton'),
  last_tick_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ubi_tick_runs (
  run_key TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  eligible_accounts INTEGER NOT NULL DEFAULT 0,
  payout_count INTEGER NOT NULL DEFAULT 0,
  accrued_amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  error TEXT
);

INSERT OR IGNORE INTO ubi_tick_state (id, last_tick_at)
VALUES ('singleton', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE INDEX IF NOT EXISTS idx_ubi_tick_runs_started_at ON ubi_tick_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_entity_dena ON ledger_accounts(entity_type, dena_balance);
