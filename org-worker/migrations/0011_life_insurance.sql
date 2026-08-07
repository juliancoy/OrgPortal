CREATE TABLE IF NOT EXISTS life_insurance_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  standard_benefit_dena REAL NOT NULL DEFAULT 1000 CHECK (standard_benefit_dena > 0),
  attestation_threshold INTEGER NOT NULL DEFAULT 3 CHECK (attestation_threshold >= 3),
  funding_account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT
);

INSERT OR IGNORE INTO life_insurance_settings
  (id, standard_benefit_dena, attestation_threshold, funding_account_id, updated_by)
VALUES (1, 1000, 3, 'acct-civic-fund', 'migration');

CREATE TABLE IF NOT EXISTS life_insurance_enrollments (
  user_id TEXT PRIMARY KEY,
  birth_date TEXT NOT NULL,
  confirmed_age INTEGER NOT NULL CHECK (confirmed_age BETWEEN 18 AND 100),
  next_of_kin_user_id TEXT NOT NULL,
  next_of_kin_relationship TEXT NOT NULL,
  beneficiary_user_id TEXT,
  beneficiary_relationship TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deceased')),
  accepted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (next_of_kin_user_id <> user_id),
  CHECK (beneficiary_user_id IS NULL OR beneficiary_user_id <> user_id)
);

CREATE TABLE IF NOT EXISTS life_insurance_claims (
  id TEXT PRIMARY KEY,
  deceased_user_id TEXT NOT NULL UNIQUE,
  date_of_death TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'funds_reserved', 'approved_pending_funds', 'paid')),
  payout_amount REAL NOT NULL CHECK (payout_amount > 0),
  recipient_user_id TEXT NOT NULL,
  recipient_account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  recipient_name TEXT NOT NULL,
  beneficiary_source TEXT NOT NULL CHECK (beneficiary_source IN ('beneficiary', 'next_of_kin')),
  funding_account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  processing_token TEXT,
  payout_transaction_id TEXT REFERENCES ledger_transactions(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS life_insurance_death_reports (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES life_insurance_claims(id) ON DELETE CASCADE,
  deceased_user_id TEXT NOT NULL,
  reporter_user_id TEXT NOT NULL,
  reporter_name TEXT NOT NULL,
  relationship_to_deceased TEXT NOT NULL,
  attested_at TEXT NOT NULL,
  UNIQUE (claim_id, reporter_user_id),
  CHECK (deceased_user_id <> reporter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_life_insurance_reports_claim ON life_insurance_death_reports(claim_id, attested_at);
CREATE INDEX IF NOT EXISTS idx_life_insurance_claims_status ON life_insurance_claims(status, updated_at);
