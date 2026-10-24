-- Full push payloads survive queue failures and are included in ordinary D1 DR exports.
-- Content expires in 23 hours. Opaque deduplication IDs remain for seven days.
CREATE TABLE push_outbox (
 id TEXT PRIMARY KEY,
 user_id TEXT,
 subscription_id TEXT,
 payload_json TEXT CHECK(payload_json IS NULL OR (json_valid(payload_json) AND length(payload_json)<=32768)),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 retire_at TEXT NOT NULL,
 next_attempt_at TEXT NOT NULL,
 lease_token TEXT,
 lease_until TEXT,
 completed_at TEXT
);
CREATE INDEX push_outbox_dispatch ON push_outbox(next_attempt_at) WHERE payload_json IS NOT NULL;
CREATE INDEX push_outbox_expiry ON push_outbox(expires_at) WHERE payload_json IS NOT NULL;
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('push_outbox','Private expiring delivery payloads; durable D1 backups only, no immutable journal or public replication.');
