CREATE TABLE organization_status_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  organization_slug TEXT NOT NULL,
  previous_role TEXT,
  previous_status TEXT,
  role TEXT,
  status TEXT,
  email_status TEXT NOT NULL DEFAULT 'queued' CHECK (email_status IN ('queued','sending','sent','skipped','failed','uncertain')),
  push_status TEXT NOT NULL DEFAULT 'queued' CHECK (push_status IN ('queued','enqueued','skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  attempted_at INTEGER,
  sent_at INTEGER,
  gmail_message_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX organization_status_email_queue ON organization_status_notifications(email_status,next_attempt_at,created_at);
CREATE INDEX organization_status_push_queue ON organization_status_notifications(push_status,created_at);
CREATE INDEX organization_status_user ON organization_status_notifications(user_id,created_at);

CREATE TRIGGER organization_status_added AFTER INSERT ON organization_memberships
BEGIN
  INSERT INTO organization_status_notifications (id,user_id,organization_id,organization_name,organization_slug,role,status,email_status,push_status)
  VALUES (lower(hex(randomblob(16))),NEW.user_id,NEW.organization_id,
    COALESCE((SELECT name FROM organizations WHERE id=NEW.organization_id),NEW.organization_id),
    COALESCE((SELECT slug FROM organizations WHERE id=NEW.organization_id),''),NEW.role,NEW.status,
    CASE WHEN COALESCE((SELECT organization_status_email FROM notification_preferences WHERE user_id=NEW.user_id),1)=1 THEN 'queued' ELSE 'skipped' END,
    CASE WHEN COALESCE((SELECT push_enabled*organization_status_push FROM notification_preferences WHERE user_id=NEW.user_id),1)=1 THEN 'queued' ELSE 'skipped' END);
END;
CREATE TRIGGER organization_status_changed AFTER UPDATE OF role,status ON organization_memberships
WHEN OLD.role IS NOT NEW.role OR OLD.status IS NOT NEW.status
BEGIN
  INSERT INTO organization_status_notifications (id,user_id,organization_id,organization_name,organization_slug,previous_role,previous_status,role,status,email_status,push_status)
  VALUES (lower(hex(randomblob(16))),NEW.user_id,NEW.organization_id,
    COALESCE((SELECT name FROM organizations WHERE id=NEW.organization_id),NEW.organization_id),
    COALESCE((SELECT slug FROM organizations WHERE id=NEW.organization_id),''),OLD.role,OLD.status,NEW.role,NEW.status,
    CASE WHEN COALESCE((SELECT organization_status_email FROM notification_preferences WHERE user_id=NEW.user_id),1)=1 THEN 'queued' ELSE 'skipped' END,
    CASE WHEN COALESCE((SELECT push_enabled*organization_status_push FROM notification_preferences WHERE user_id=NEW.user_id),1)=1 THEN 'queued' ELSE 'skipped' END);
END;
CREATE TRIGGER organization_status_removed BEFORE DELETE ON organization_memberships
BEGIN
  INSERT INTO organization_status_notifications (id,user_id,organization_id,organization_name,organization_slug,previous_role,previous_status,email_status,push_status)
  VALUES (lower(hex(randomblob(16))),OLD.user_id,OLD.organization_id,
    COALESCE((SELECT name FROM organizations WHERE id=OLD.organization_id),OLD.organization_id),
    COALESCE((SELECT slug FROM organizations WHERE id=OLD.organization_id),''),OLD.role,OLD.status,
    CASE WHEN COALESCE((SELECT organization_status_email FROM notification_preferences WHERE user_id=OLD.user_id),1)=1 THEN 'queued' ELSE 'skipped' END,
    CASE WHEN COALESCE((SELECT push_enabled*organization_status_push FROM notification_preferences WHERE user_id=OLD.user_id),1)=1 THEN 'queued' ELSE 'skipped' END);
END;
