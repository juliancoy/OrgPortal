-- Private, unique recipient engagement. Tests and older sends are not backfilled.
CREATE TABLE email_engagement (
 delivery_id TEXT PRIMARY KEY REFERENCES email_deliveries(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,
 opened_at INTEGER,
 clicked_at INTEGER,
 unsubscribed_at INTEGER
);
CREATE INDEX email_engagement_expiry ON email_engagement(expires_at);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('email_engagement','private campaign engagement; 90 day expiry; no public replicas or immutable journal');
