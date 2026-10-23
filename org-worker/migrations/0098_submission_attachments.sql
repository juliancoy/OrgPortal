-- Reviewed: file metadata remains after parent deletion until R2 cleanup succeeds.
-- Deliberately no cascading FK: deleting metadata first would orphan stored files.
CREATE TABLE event_presentation_attachments (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL,
 organization_id TEXT NOT NULL,
 name TEXT NOT NULL,
 content_type TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 20971520),
 sha256 TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('pending','ready')),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL
);
CREATE INDEX presentation_attachments_parent ON event_presentation_attachments(event_id,organization_id,state);
CREATE INDEX presentation_attachments_expiry ON event_presentation_attachments(expires_at);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('event_presentation_attachments','Deletable submission files; metadata retained only until object deletion succeeds; no immutable or replica copies');
