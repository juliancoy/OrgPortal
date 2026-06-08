ALTER TABLE chat_messages ADD COLUMN client_message_id TEXT;
ALTER TABLE chat_messages ADD COLUMN sequence INTEGER;

UPDATE chat_messages
SET client_message_id = 'server:' || id
WHERE client_message_id IS NULL;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at ASC, id ASC) AS seq
  FROM chat_messages
  WHERE sequence IS NULL
)
UPDATE chat_messages
SET sequence = (SELECT seq FROM ranked WHERE ranked.id = chat_messages.id)
WHERE sequence IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_sender_client
  ON chat_messages(sender_user_id, client_message_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_conversation_sequence
  ON chat_messages(conversation_id, sequence);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_visible_sequence
  ON chat_messages(conversation_id, moderation_state, deleted_at, sequence);

CREATE TABLE IF NOT EXISTS chat_conversation_sequences (
  conversation_id TEXT PRIMARY KEY,
  next_sequence INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);

INSERT INTO chat_conversation_sequences (conversation_id, next_sequence)
SELECT
  c.id,
  COALESCE(MAX(m.sequence), 0) + 1
FROM chat_conversations c
LEFT JOIN chat_messages m ON m.conversation_id = c.id
GROUP BY c.id
ON CONFLICT(conversation_id) DO NOTHING;

