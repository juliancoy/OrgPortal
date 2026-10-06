CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  organization_status_email INTEGER NOT NULL DEFAULT 1 CHECK (organization_status_email IN (0,1)),
  organization_status_push INTEGER NOT NULL DEFAULT 1 CHECK (organization_status_push IN (0,1)),
  push_enabled INTEGER NOT NULL DEFAULT 1 CHECK (push_enabled IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
