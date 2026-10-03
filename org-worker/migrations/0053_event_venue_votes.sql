-- Independent directional preferences; existing ranked ballots are preserved.
CREATE TABLE event_venue_votes (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL,
 value INTEGER NOT NULL CHECK (value IN (-1, 0, 1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (event_id, venue_id, user_id)
);
CREATE INDEX event_venue_votes_user ON event_venue_votes(user_id, event_id);
