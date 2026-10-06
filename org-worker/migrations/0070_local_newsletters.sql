-- Preserve existing log history and cursors while expanding its entity domain.
DROP TRIGGER ecosystem_sync_immutable;
ALTER TABLE ecosystem_sync_changes RENAME TO ecosystem_sync_changes_v1;
DROP INDEX ecosystem_sync_record;
CREATE TABLE ecosystem_sync_changes (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 entity TEXT NOT NULL CHECK(entity IN ('organization','event','funding','newsletter')),
 record_id TEXT NOT NULL,
 replica_id TEXT NOT NULL,
 counter INTEGER NOT NULL CHECK(counter>0),
 deleted INTEGER NOT NULL CHECK(deleted IN (0,1)),
 value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 pending INTEGER NOT NULL DEFAULT 0 CHECK(pending IN (0,1)),
 CHECK((deleted=1 AND value_json='null') OR (deleted=0 AND json_type(value_json)='object'))
);
INSERT INTO ecosystem_sync_changes SELECT * FROM ecosystem_sync_changes_v1;
DROP TABLE ecosystem_sync_changes_v1;
CREATE INDEX ecosystem_sync_record ON ecosystem_sync_changes(entity,record_id,counter,replica_id,id);
CREATE TRIGGER ecosystem_sync_immutable BEFORE UPDATE OF entity,record_id,replica_id,counter,deleted,value_json ON ecosystem_sync_changes
BEGIN SELECT RAISE(ABORT,'Conflicting reuse of change ID'); END;

-- Local data is outside snapshot replacement. Versions and receipts survive refresh.
CREATE TABLE local_newsletter_imports (
 id TEXT PRIMARY KEY,
 document_json TEXT NOT NULL CHECK(json_valid(document_json)),
 content_hash TEXT NOT NULL,
 change_id TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL
);
CREATE TABLE local_newsletter_previews (
 id TEXT PRIMARY KEY,
 content_hash TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 applied_at TEXT
);
