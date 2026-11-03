-- Explicit DM request and security acceptance. Additive; no messages are changed.
-- -1 means the member has not accepted the current request/security revision.
ALTER TABLE chat_conversation_members ADD COLUMN accepted_security_revision INTEGER NOT NULL DEFAULT -1;
