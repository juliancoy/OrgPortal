-- Private anonymous intake; no organization ownership or public relationship inferred.
CREATE TABLE event_guest_presentations (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 contact_name TEXT NOT NULL,
 email TEXT NOT NULL,
 organization_name TEXT NOT NULL,
 title TEXT NOT NULL,
 summary TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL
);
CREATE INDEX guest_presentations_event ON event_guest_presentations(event_id,created_at);
CREATE INDEX guest_presentations_expiry ON event_guest_presentations(expires_at);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('event_guest_presentations','Private anonymous presentation intake; expires 90 days after event; no public replica or immutable journal');
