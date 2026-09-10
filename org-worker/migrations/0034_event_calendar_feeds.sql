CREATE TABLE IF NOT EXISTS event_calendar_feeds (
  user_id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_calendar_feeds_token ON event_calendar_feeds(token);
CREATE INDEX IF NOT EXISTS idx_event_registrations_user_registered ON event_registrations(user_id, registered_at, event_id);
