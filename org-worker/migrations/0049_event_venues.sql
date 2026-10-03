CREATE TABLE venues (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 address TEXT,
 website TEXT,
 amenities TEXT,
 capacity TEXT,
 cost TEXT,
 opening_hours TEXT,
 category TEXT NOT NULL DEFAULT 'indoor',
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 organization_id TEXT REFERENCES organizations(id),
 created_by_user_id TEXT,
 contact_name TEXT,
 contact_email TEXT,
 contact_phone TEXT,
 notes TEXT,
 source_url TEXT,
 source_rows_json TEXT NOT NULL DEFAULT '[]',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX venues_name ON venues(name);
CREATE TABLE event_venues (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 venue_id TEXT NOT NULL REFERENCES venues(id),
 status TEXT NOT NULL CHECK(status IN ('candidate','confirmed')),
 PRIMARY KEY(event_id,venue_id)
);
CREATE UNIQUE INDEX event_one_confirmed_venue ON event_venues(event_id) WHERE status = 'confirmed';
ALTER TABLE events ADD COLUMN event_date TEXT;
ALTER TABLE events ADD COLUMN timezone TEXT;
