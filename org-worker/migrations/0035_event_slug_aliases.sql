CREATE TABLE IF NOT EXISTS event_slug_aliases (
  slug TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_event_slug_aliases_event ON event_slug_aliases(event_id);
