CREATE TABLE governance_personal_drafts (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 document_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 name TEXT NOT NULL,
 head INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX governance_personal_drafts_directory ON governance_personal_drafts(organization_id,document_id,updated_at DESC,id);
CREATE TABLE governance_personal_draft_revisions (
 draft_id TEXT NOT NULL REFERENCES governance_personal_drafts(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision > 0),
 parent_revision INTEGER NOT NULL,
 base_version INTEGER NOT NULL,
 sections_json TEXT NOT NULL,
 base_sections_json TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 message TEXT NOT NULL,
 sources_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(draft_id,revision),
 UNIQUE(draft_id,parent_revision)
);
CREATE TRIGGER governance_personal_revision_immutable BEFORE UPDATE ON governance_personal_draft_revisions
BEGIN SELECT RAISE(ABORT,'Saved draft revisions are immutable; append a revision instead'); END;
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('governance_personal_drafts','Member-only editorial drafts: mutable head pointer; full immutable snapshots in governance_personal_draft_revisions; privacy deletion must remove drafts and snapshots together'),
 ('governance_personal_draft_revisions','Dedicated append-only draft snapshot history with parent revisions and hashes; excluded from public replication and duplicate immutable journals to support privacy deletion');
