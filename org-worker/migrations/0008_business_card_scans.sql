CREATE TABLE IF NOT EXISTS business_card_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  per_user_limit_per_hour INTEGER NOT NULL DEFAULT 60,
  per_ip_limit_per_hour INTEGER NOT NULL DEFAULT 120,
  global_limit_per_hour INTEGER NOT NULL DEFAULT 1000,
  duplicate_hash_limit INTEGER NOT NULL DEFAULT 8,
  duplicate_hash_window_seconds INTEGER NOT NULL DEFAULT 86400,
  max_bytes INTEGER NOT NULL DEFAULT 6291456,
  allowed_content_types TEXT NOT NULL DEFAULT '["image/jpeg","image/png","image/webp","image/heic","image/heif"]',
  auto_clarification_enabled INTEGER NOT NULL DEFAULT 1,
  auto_min_confidence REAL NOT NULL DEFAULT 0.75,
  auto_min_margin REAL NOT NULL DEFAULT 0.2,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT
);

INSERT OR IGNORE INTO business_card_settings (id, updated_by)
VALUES (1, 'migration-0008-business-card-scans');

CREATE TABLE IF NOT EXISTS business_card_scans (
  id TEXT PRIMARY KEY,
  submitted_by_user_id TEXT NOT NULL,
  submitted_by_email TEXT,
  submitted_by_name TEXT,
  submitted_ip TEXT,
  scan_kind_requested TEXT NOT NULL DEFAULT 'auto',
  scan_kind TEXT NOT NULL DEFAULT 'person',
  notes TEXT,
  original_filename TEXT,
  content_type TEXT,
  image_size INTEGER NOT NULL DEFAULT 0,
  image_hash TEXT NOT NULL,
  image_key TEXT,
  extracted_name TEXT,
  extracted_email TEXT,
  extracted_phone TEXT,
  extracted_company TEXT,
  extracted_title TEXT,
  extracted_url TEXT,
  created_target_type TEXT,
  created_target_id TEXT,
  created_target_slug TEXT,
  created_target_name TEXT,
  created_targets TEXT NOT NULL DEFAULT '[]',
  clarification_required INTEGER NOT NULL DEFAULT 0,
  clarification_message TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  pidp_user_created INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_business_card_scans_submitter_created
ON business_card_scans(submitted_by_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_business_card_scans_created
ON business_card_scans(created_at);

CREATE INDEX IF NOT EXISTS idx_business_card_scans_hash_created
ON business_card_scans(image_hash, created_at);
