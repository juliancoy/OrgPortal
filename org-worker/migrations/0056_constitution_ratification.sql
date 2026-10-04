ALTER TABLE governance_motions ADD COLUMN document_action TEXT NOT NULL DEFAULT 'amend' CHECK(document_action IN ('amend','ratify'));
ALTER TABLE governance_motions ADD COLUMN ratification_snapshot TEXT;
ALTER TABLE governance_motions ADD COLUMN ratification_hash TEXT;
ALTER TABLE governance_motions ADD COLUMN ratification_authority TEXT;
ALTER TABLE governance_motions ADD COLUMN ratification_notice_at TEXT;
CREATE UNIQUE INDEX idx_one_active_ratification ON governance_motions(document_id)
 WHERE document_action='ratify' AND status NOT IN ('passed','failed','withdrawn');
CREATE TABLE governance_document_ratifications (
 document_id TEXT PRIMARY KEY,
 version INTEGER NOT NULL,
 motion_id TEXT NOT NULL UNIQUE REFERENCES governance_motions(id),
 snapshot_json TEXT NOT NULL,
 snapshot_hash TEXT NOT NULL,
 authority_record TEXT NOT NULL,
 ratified_at TEXT NOT NULL,
 effective_at TEXT NOT NULL
);
-- Freeze the candidate in the database, including concurrent requests and
-- callers using the older motion interfaces. A failed/withdrawn vote unlocks it.
CREATE TRIGGER governance_ratification_freeze_new_motion BEFORE INSERT ON governance_motions
WHEN NEW.document_id IS NOT NULL AND EXISTS(
 SELECT 1 FROM governance_motions WHERE document_id=NEW.document_id
 AND document_action='ratify' AND status NOT IN ('passed','failed','withdrawn'))
BEGIN SELECT RAISE(ABORT,'Finish the active ratification ticket before proposing changes'); END;
CREATE TRIGGER governance_ratification_requires_clear_agenda BEFORE INSERT ON governance_motions
WHEN NEW.document_action='ratify' AND EXISTS(
 SELECT 1 FROM governance_motions WHERE document_id=NEW.document_id
 AND status NOT IN ('passed','failed','withdrawn'))
BEGIN SELECT RAISE(ABORT,'Resolve open change tickets before proposing ratification'); END;
CREATE TRIGGER governance_ratification_freeze_revision BEFORE INSERT ON governance_document_revisions
WHEN EXISTS(SELECT 1 FROM governance_motions WHERE document_id=NEW.document_id
 AND document_action='ratify' AND status NOT IN ('passed','failed','withdrawn'))
BEGIN SELECT RAISE(ABORT,'The ratification candidate is frozen'); END;
