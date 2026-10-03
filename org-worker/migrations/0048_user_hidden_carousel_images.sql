CREATE TABLE IF NOT EXISTS user_hidden_carousel_images (
 tenant_id TEXT NOT NULL REFERENCES portal_tenants(id),
 user_id TEXT NOT NULL,
 carousel_id TEXT NOT NULL,
 file_id TEXT NOT NULL,
 hidden_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY (tenant_id,user_id,carousel_id,file_id)
);
