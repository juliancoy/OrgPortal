-- Private account archives never enter the public ecosystem replication feed.
CREATE TABLE private_newsletter_changes (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 owner_id TEXT NOT NULL,
 resource TEXT NOT NULL,
 change_id TEXT NOT NULL,
 record_id TEXT NOT NULL,
 replica_id TEXT NOT NULL,
 counter INTEGER NOT NULL CHECK(counter>0),
 deleted INTEGER NOT NULL CHECK(deleted IN (0,1)),
 value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 fingerprint TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(owner_id,resource,change_id)
);
CREATE INDEX private_newsletter_feed ON private_newsletter_changes(owner_id,resource,sequence);
CREATE INDEX private_newsletter_records ON private_newsletter_changes(owner_id,resource,record_id,counter,replica_id,change_id);
CREATE TRIGGER private_newsletter_immutable BEFORE UPDATE ON private_newsletter_changes
BEGIN SELECT RAISE(ABORT,'Conflicting newsletter change identity'); END;
CREATE TABLE private_newsletter_archives (
 owner_id TEXT NOT NULL,
 resource TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,resource,fingerprint)
);
CREATE TABLE private_newsletter_previews (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 resource TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 applied_at TEXT
);
CREATE TRIGGER private_newsletter_receipt_once BEFORE UPDATE OF applied_at ON private_newsletter_previews
WHEN OLD.applied_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Newsletter preview already applied'); END;
CREATE INDEX private_newsletter_preview_expiry ON private_newsletter_previews(expires_at);
