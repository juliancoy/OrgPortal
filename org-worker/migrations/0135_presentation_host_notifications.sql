-- Transactional host alerts. No historical backfill and no proposal/email copies.
CREATE TABLE presentation_host_notifications (
 id INTEGER PRIMARY KEY,
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 source TEXT NOT NULL CHECK(source IN ('team','guest')),
 submission_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','accepted','uncertain','failed','skipped')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL DEFAULT 0,
 attempted_at INTEGER,
 error_code TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 expires_at TEXT NOT NULL,
 UNIQUE(event_id,source,submission_id,user_id)
);
CREATE INDEX presentation_host_notification_queue ON presentation_host_notifications(status,next_attempt_at,id);
CREATE INDEX presentation_host_notification_expiry ON presentation_host_notifications(expires_at);
CREATE TRIGGER presentation_notify_hosts AFTER INSERT ON event_submissions BEGIN
 INSERT OR IGNORE INTO presentation_host_notifications(event_id,organization_id,source,submission_id,user_id,expires_at)
 SELECT NEW.event_id,e.host_org_id,'team',NEW.submission_id,m.user_id,NEW.expires_at
 FROM events e JOIN organization_memberships m ON m.organization_id=e.host_org_id
 WHERE e.id=NEW.event_id AND m.status='active' AND m.role IN ('owner','administrator');
END;
CREATE TRIGGER guest_presentation_notify_hosts AFTER INSERT ON event_guest_presentations BEGIN
 INSERT OR IGNORE INTO presentation_host_notifications(event_id,organization_id,source,submission_id,user_id,expires_at)
 SELECT NEW.event_id,e.host_org_id,'guest',NEW.id,m.user_id,NEW.expires_at
 FROM events e JOIN organization_memberships m ON m.organization_id=e.host_org_id
 WHERE e.id=NEW.event_id AND m.status='active' AND m.role IN ('owner','administrator');
END;
CREATE TRIGGER presentation_delete_host_notifications AFTER DELETE ON event_submissions BEGIN
 DELETE FROM presentation_host_notifications WHERE event_id=OLD.event_id AND source='team' AND submission_id=OLD.submission_id;
END;
CREATE TRIGGER guest_presentation_delete_host_notifications AFTER DELETE ON event_guest_presentations BEGIN
 DELETE FROM presentation_host_notifications WHERE event_id=OLD.event_id AND source='guest' AND submission_id=OLD.id;
END;
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('presentation_host_notifications','Private transactional host email delivery references; expire with the application, no public replication or journal.');
