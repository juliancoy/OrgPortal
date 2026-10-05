CREATE TABLE member_meeting_preferences (
 tenant_id TEXT NOT NULL REFERENCES portal_tenants(id),
 user_id TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 timezone TEXT NOT NULL,
 PRIMARY KEY(tenant_id,user_id)
);
CREATE TABLE member_meetings (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES portal_tenants(id),
 host_user_id TEXT NOT NULL,
 guest_user_id TEXT NOT NULL,
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK(host_user_id <> guest_user_id)
);
CREATE INDEX member_meetings_host_time ON member_meetings(host_user_id,starts_at,status);
CREATE INDEX member_meetings_guest_time ON member_meetings(guest_user_id,starts_at,status);
