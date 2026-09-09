-- No provider credentials, email addresses, event content or access tokens are stored here.
CREATE TABLE IF NOT EXISTS event_mcp_operations (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('prepared', 'executing', 'completed', 'uncertain')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  completed_steps_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_event_mcp_actor ON event_mcp_operations(actor_user_id, created_at);
CREATE TABLE IF NOT EXISTS event_mcp_rate_limits (
  actor_user_id TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  requests INTEGER NOT NULL
);
