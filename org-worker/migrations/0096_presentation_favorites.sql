-- Reviewed: additive, expiring private preferences; no existing data is rewritten.
CREATE TABLE event_presentation_favorites (
 event_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 3),
 organization_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 PRIMARY KEY(event_id,user_id,slot),
 UNIQUE(event_id,user_id,organization_id),
 FOREIGN KEY(event_id,organization_id) REFERENCES event_presentation_submissions(event_id,organization_id) ON DELETE CASCADE
);
CREATE INDEX event_presentation_favorites_expiry ON event_presentation_favorites(expires_at);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('event_presentation_favorites','Private expiring preferences; excluded from public replicas and immutable journals');
