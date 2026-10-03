ALTER TABLE governance_motions ADD COLUMN document_id TEXT;
ALTER TABLE governance_motions ADD COLUMN document_section TEXT;
ALTER TABLE governance_motions ADD COLUMN document_version INTEGER;
ALTER TABLE governance_motions ADD COLUMN document_base TEXT;
ALTER TABLE governance_motions ADD COLUMN electorate_json TEXT;
ALTER TABLE governance_motions ADD COLUMN chair_id TEXT;
CREATE INDEX idx_governance_document ON governance_motions(document_id, created_at);
CREATE TABLE governance_document_revisions (
 document_id TEXT NOT NULL,
 version INTEGER NOT NULL,
 sections_json TEXT NOT NULL,
 motion_id TEXT NOT NULL UNIQUE REFERENCES governance_motions(id),
 created_at TEXT NOT NULL,
 PRIMARY KEY(document_id,version)
);
CREATE TABLE governance_motion_events (
 id TEXT PRIMARY KEY,
 motion_id TEXT NOT NULL REFERENCES governance_motions(id),
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL,
 detail TEXT NOT NULL,
 created_at TEXT NOT NULL
);
