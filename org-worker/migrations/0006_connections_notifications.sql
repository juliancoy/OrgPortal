CREATE TABLE IF NOT EXISTS user_connections (
  id TEXT PRIMARY KEY,
  pair_key TEXT NOT NULL UNIQUE,
  requester_user_id TEXT NOT NULL,
  requester_user_name TEXT,
  recipient_user_id TEXT NOT NULL,
  recipient_user_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'canceled')),
  requested_at TEXT NOT NULL,
  responded_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_connections_requester ON user_connections(requester_user_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_user_connections_recipient ON user_connections(recipient_user_id, status, updated_at);

CREATE TABLE IF NOT EXISTS user_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  actor_user_id TEXT,
  actor_user_name TEXT,
  entity_id TEXT,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read')),
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_status ON user_notifications(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_user_notifications_entity ON user_notifications(entity_id, type);
