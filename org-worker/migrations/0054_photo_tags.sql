CREATE TABLE photo_annotations (
 tenant_id TEXT NOT NULL REFERENCES portal_tenants(id) ON DELETE CASCADE,
 source TEXT NOT NULL CHECK(source IN ('event','organization','carousel')),
 owner_id TEXT NOT NULL,
 photo_id TEXT NOT NULL,
 tags_json TEXT NOT NULL DEFAULT '[]',
 version INTEGER NOT NULL DEFAULT 0,
 updated_by_user_id TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_id,source,owner_id,photo_id)
);
