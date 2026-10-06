-- Original Gmail MIME trees are private local evidence, separate from snapshots.
CREATE TABLE newsletter_source_archives (
 id TEXT PRIMARY KEY,
 gmail_message_id TEXT NOT NULL,
 record_id TEXT NOT NULL,
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 created_at TEXT NOT NULL
);
CREATE INDEX newsletter_source_message ON newsletter_source_archives(gmail_message_id);
