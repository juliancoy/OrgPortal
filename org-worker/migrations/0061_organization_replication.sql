CREATE TABLE IF NOT EXISTS organization_replica_state (
 id INTEGER PRIMARY KEY CHECK(id=1), source TEXT NOT NULL, etag TEXT,
 checked_at TEXT, applied_at TEXT, organization_count INTEGER,
 support_count INTEGER, error TEXT
);
