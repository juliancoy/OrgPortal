CREATE TABLE event_presentation_forms (
 event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
CREATE TABLE event_presentation_submissions (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 submitted_by TEXT NOT NULL,
 title TEXT NOT NULL,
 summary TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','accepted','declined')),
 updated_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 PRIMARY KEY(event_id,organization_id)
);
CREATE INDEX event_presentations_expiry ON event_presentation_submissions(expires_at);
-- Private proposals must remain withdrawable and expire, without immutable copies.
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('event_presentation_forms','event-owned presentation intake settings; no immutable history required'),
 ('event_presentation_submissions','private deletable team proposals; expire after event and excluded from immutable journals');
