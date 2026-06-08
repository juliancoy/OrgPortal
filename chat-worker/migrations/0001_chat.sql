CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('dm', 'org_room', 'event_room', 'system')),
  title TEXT,
  slug TEXT,
  dm_key TEXT UNIQUE,
  created_by_user_id TEXT NOT NULL,
  org_id TEXT,
  event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT,
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated
  ON chat_conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_conversation_members (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'invited', 'blocked', 'left')),
  joined_at TEXT NOT NULL,
  last_read_message_id TEXT,
  last_read_at TEXT,
  muted_until TEXT,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_members_user
  ON chat_conversation_members(user_id, state);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  sender_name TEXT,
  body TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'system')),
  attachment_id TEXT,
  reply_to_message_id TEXT,
  thread_root_message_id TEXT,
  created_at TEXT NOT NULL,
  edited_at TEXT,
  deleted_at TEXT,
  moderation_state TEXT NOT NULL DEFAULT 'visible' CHECK (moderation_state IN ('visible', 'hidden', 'flagged')),
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
  ON chat_messages(conversation_id, created_at, id);

CREATE TABLE IF NOT EXISTS chat_attachments (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_message_receipts (
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  receipt_type TEXT NOT NULL CHECK (receipt_type IN ('delivered', 'read')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, message_id, user_id, receipt_type)
);

CREATE INDEX IF NOT EXISTS idx_chat_receipts_user
  ON chat_message_receipts(user_id, created_at DESC);

