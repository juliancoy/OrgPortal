-- Independent backup database. No application/domain permissions live here.
CREATE TABLE journal_entries (
 source_id TEXT NOT NULL,
 sequence INTEGER NOT NULL,
 table_name TEXT NOT NULL,
 record_key TEXT NOT NULL CHECK(json_valid(record_key)),
 operation TEXT NOT NULL CHECK(operation IN ('insert','update','delete')),
 before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
 after_json TEXT CHECK(after_json IS NULL OR json_valid(after_json)),
 recorded_at TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 PRIMARY KEY(source_id,sequence)
);
CREATE TRIGGER journal_entries_no_update BEFORE UPDATE ON journal_entries
BEGIN SELECT RAISE(ABORT,'Secondary journal is append-only'); END;
CREATE TRIGGER journal_entries_no_delete BEFORE DELETE ON journal_entries
BEGIN SELECT RAISE(ABORT,'Secondary journal is append-only'); END;
CREATE TABLE journal_checkpoints (
 source_id TEXT PRIMARY KEY,
 sequence INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL
);
