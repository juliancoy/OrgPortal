CREATE TABLE user_tasks (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES portal_tenants(id),
 user_id TEXT NOT NULL,
 created_by_user_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK (kind IN ('personal','availability')),
 entity_id TEXT,
 title TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 completed_at TEXT,
 UNIQUE (tenant_id,user_id,kind,entity_id)
);
CREATE INDEX idx_user_tasks_queue ON user_tasks(tenant_id,user_id,status,created_at);
CREATE TABLE availability_invites (
 poll_id TEXT NOT NULL REFERENCES availability_polls(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL,
 invited_by_user_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY (poll_id,user_id)
);
