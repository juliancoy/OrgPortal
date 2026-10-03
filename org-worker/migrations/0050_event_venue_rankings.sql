CREATE TABLE event_venue_rankings (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL,
 venue_ids_json TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(event_id,user_id)
);
