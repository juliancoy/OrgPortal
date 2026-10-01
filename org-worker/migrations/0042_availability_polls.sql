CREATE TABLE availability_polls (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 owner_user_id TEXT NOT NULL,
 title TEXT NOT NULL,
 timezone TEXT NOT NULL,
 slots_json TEXT NOT NULL,
 closed INTEGER NOT NULL DEFAULT 0 CHECK(closed IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX availability_polls_owner ON availability_polls(tenant_id,owner_user_id,created_at);
CREATE TABLE availability_responses (
 poll_id TEXT NOT NULL REFERENCES availability_polls(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL,
 slots_json TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(poll_id,user_id)
);
