-- Additive migration. Existing messages remain plaintext; no history is rewritten.
ALTER TABLE chat_conversations ADD COLUMN encryption_mode TEXT NOT NULL DEFAULT 'none'
  CHECK(encryption_mode IN ('none', 'rsa', 'rsa-mlkem'));
ALTER TABLE chat_conversations ADD COLUMN encryption_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN encryption TEXT;

-- Only public keys live on the server. Device-held private keys never enter D1.
CREATE TABLE chat_device_keys (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  rsa_jwk TEXT NOT NULL,
  kem_public TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY(user_id, device_id)
);
CREATE INDEX chat_device_keys_expiry ON chat_device_keys(expires_at);

-- A stale sender must refresh after membership/device changes. Message insertion
-- checks this revision atomically, including across policy changes.
CREATE TRIGGER chat_encryption_member_insert AFTER INSERT ON chat_conversation_members
BEGIN UPDATE chat_conversations SET encryption_revision=encryption_revision+1 WHERE id=NEW.conversation_id; END;
CREATE TRIGGER chat_encryption_member_change AFTER UPDATE OF state,role ON chat_conversation_members
WHEN OLD.state IS NOT NEW.state OR OLD.role IS NOT NEW.role
BEGIN UPDATE chat_conversations SET encryption_revision=encryption_revision+1 WHERE id=NEW.conversation_id; END;
CREATE TRIGGER chat_encryption_member_delete AFTER DELETE ON chat_conversation_members
BEGIN UPDATE chat_conversations SET encryption_revision=encryption_revision+1 WHERE id=OLD.conversation_id; END;
CREATE TRIGGER chat_encryption_device_insert AFTER INSERT ON chat_device_keys
BEGIN UPDATE chat_conversations SET encryption_revision=encryption_revision+1
  WHERE id IN (SELECT conversation_id FROM chat_conversation_members WHERE user_id=NEW.user_id); END;
CREATE TRIGGER chat_encryption_device_change AFTER UPDATE OF revoked_at,expires_at ON chat_device_keys
WHEN OLD.revoked_at IS NOT NEW.revoked_at OR OLD.expires_at<=NEW.last_seen_at
BEGIN UPDATE chat_conversations SET encryption_revision=encryption_revision+1
  WHERE id IN (SELECT conversation_id FROM chat_conversation_members WHERE user_id=NEW.user_id); END;
CREATE TRIGGER chat_encryption_device_delete AFTER DELETE ON chat_device_keys
BEGIN UPDATE chat_conversations SET encryption_revision=encryption_revision+1
  WHERE id IN (SELECT conversation_id FROM chat_conversation_members WHERE user_id=OLD.user_id); END;
