-- Reviewed: additive rollout. Legacy entries keep organization IDs as submission IDs.
-- One-way mirrors keep old Worker writes safe until the new Worker is deployed.
CREATE TABLE event_submissions (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 submission_id TEXT NOT NULL,
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 submitted_by TEXT NOT NULL,
 title TEXT NOT NULL,
 summary TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','accepted','declined')),
 updated_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 PRIMARY KEY(event_id,submission_id)
);
CREATE INDEX event_submissions_expiry ON event_submissions(expires_at);
CREATE INDEX event_submissions_team ON event_submissions(event_id,organization_id);
INSERT INTO event_submissions SELECT event_id,organization_id,organization_id,submitted_by,title,summary,status,updated_at,expires_at FROM event_presentation_submissions;
CREATE TABLE event_submission_favorites (
 event_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 100),
 submission_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 PRIMARY KEY(event_id,user_id,slot),
 UNIQUE(event_id,user_id,submission_id),
 FOREIGN KEY(event_id,submission_id) REFERENCES event_submissions(event_id,submission_id) ON DELETE CASCADE
);
CREATE INDEX event_submission_favorites_expiry ON event_submission_favorites(expires_at);
INSERT INTO event_submission_favorites SELECT event_id,user_id,slot,organization_id,created_at,expires_at FROM event_presentation_favorites;
ALTER TABLE event_presentation_attachments ADD COLUMN submission_id TEXT NOT NULL DEFAULT '';
UPDATE event_presentation_attachments SET submission_id=organization_id;
CREATE INDEX presentation_attachments_submission ON event_presentation_attachments(event_id,submission_id,state);
CREATE TRIGGER legacy_submission_insert AFTER INSERT ON event_presentation_submissions BEGIN
 INSERT INTO event_submissions VALUES(NEW.event_id,NEW.organization_id,NEW.organization_id,NEW.submitted_by,NEW.title,NEW.summary,NEW.status,NEW.updated_at,NEW.expires_at);
END;
CREATE TRIGGER legacy_submission_update AFTER UPDATE ON event_presentation_submissions BEGIN
 UPDATE event_submissions SET title=NEW.title,summary=NEW.summary,status=NEW.status,submitted_by=NEW.submitted_by,updated_at=NEW.updated_at,expires_at=NEW.expires_at WHERE event_id=OLD.event_id AND submission_id=OLD.organization_id;
END;
CREATE TRIGGER legacy_submission_delete AFTER DELETE ON event_presentation_submissions BEGIN
 DELETE FROM event_submissions WHERE event_id=OLD.event_id AND submission_id=OLD.organization_id;
END;
CREATE TRIGGER legacy_favorite_insert AFTER INSERT ON event_presentation_favorites BEGIN
 INSERT OR IGNORE INTO event_submission_favorites VALUES(NEW.event_id,NEW.user_id,NEW.slot,NEW.organization_id,NEW.created_at,NEW.expires_at);
END;
CREATE TRIGGER legacy_favorite_delete AFTER DELETE ON event_presentation_favorites BEGIN
 DELETE FROM event_submission_favorites WHERE event_id=OLD.event_id AND user_id=OLD.user_id AND submission_id=OLD.organization_id;
END;
CREATE TRIGGER legacy_attachment_insert AFTER INSERT ON event_presentation_attachments WHEN NEW.submission_id='' BEGIN
 UPDATE event_presentation_attachments SET submission_id=NEW.organization_id WHERE id=NEW.id;
END;
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('event_submissions','Expiring submissions; deletable, no immutable journal or public replicas'),
 ('event_submission_favorites','Private expiring preferences; no immutable journal or public replicas');
