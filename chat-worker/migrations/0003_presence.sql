CREATE TABLE IF NOT EXISTS chat_presence (
  user_id TEXT PRIMARY KEY,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_presence_last_seen
  ON chat_presence(last_seen_at);
