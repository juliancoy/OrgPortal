-- Reviewed: preserves existing choices and widens slots for configurable limits.
ALTER TABLE event_presentation_forms ADD COLUMN favorite_limit INTEGER NOT NULL DEFAULT 3 CHECK(favorite_limit BETWEEN 1 AND 100);
CREATE TABLE event_presentation_favorites_next (
 event_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 100),
 organization_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 PRIMARY KEY(event_id,user_id,slot),
 UNIQUE(event_id,user_id,organization_id),
 FOREIGN KEY(event_id,organization_id) REFERENCES event_presentation_submissions(event_id,organization_id) ON DELETE CASCADE
);
INSERT INTO event_presentation_favorites_next SELECT * FROM event_presentation_favorites;
DROP TABLE event_presentation_favorites;
ALTER TABLE event_presentation_favorites_next RENAME TO event_presentation_favorites;
CREATE INDEX event_presentation_favorites_expiry ON event_presentation_favorites(expires_at);
