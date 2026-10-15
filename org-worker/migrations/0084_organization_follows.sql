-- Private subscriptions: never grant membership or enter public replicas/journals.
CREATE TABLE organization_follows (
 user_id TEXT NOT NULL,
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(user_id, organization_id)
);
CREATE INDEX organization_follows_org ON organization_follows(organization_id, created_at, user_id);
CREATE TABLE organization_follow_event_jobs (
 event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 last_user_id TEXT NOT NULL DEFAULT '',
 expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 days'))
);
CREATE TRIGGER organization_follow_event_published AFTER INSERT ON events
WHEN NEW.host_org_id IS NOT NULL
 AND (COALESCE(NEW.starts_at, NEW.event_date) IS NULL OR COALESCE(NEW.starts_at, NEW.event_date) >= date('now'))
 AND EXISTS (SELECT 1 FROM organization_follows WHERE organization_id = NEW.host_org_id)
BEGIN
 INSERT OR IGNORE INTO organization_follow_event_jobs(event_id, organization_id) VALUES (NEW.id, NEW.host_org_id);
END;
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('organization_follows','Private account follow preferences deleted on unfollow or account deletion'),
 ('organization_follow_event_jobs','Private notification work deleted after delivery or seven days');

-- Follow notices reveal private preferences and must not enter the immutable journal.
DROP TRIGGER "journal_user_notifications_insert";
CREATE TRIGGER "journal_user_notifications_insert" AFTER INSERT ON "user_notifications"
WHEN NEW.type <> 'organization_event' AND NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('user_notifications',json_object('id',NEW."id"),'insert',NULL,json_object('id',NEW."id",'user_id',NEW."user_id",'type',NEW."type",'actor_user_id',NEW."actor_user_id",'actor_user_name',NEW."actor_user_name",'entity_id',NEW."entity_id",'title',NEW."title",'body',NEW."body",'status',NEW."status",'created_at',NEW."created_at",'read_at',NEW."read_at",'community_id',NEW."community_id",'deep_link',NEW."deep_link",'push_enqueued_at',NEW."push_enqueued_at")); END;
DROP TRIGGER "journal_user_notifications_update";
CREATE TRIGGER "journal_user_notifications_update" AFTER UPDATE ON "user_notifications"
WHEN OLD.type <> 'organization_event' AND NEW.type <> 'organization_event' AND NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."id" IS NEW."id" AND OLD."user_id" IS NEW."user_id" AND OLD."type" IS NEW."type" AND OLD."actor_user_id" IS NEW."actor_user_id" AND OLD."actor_user_name" IS NEW."actor_user_name" AND OLD."entity_id" IS NEW."entity_id" AND OLD."title" IS NEW."title" AND OLD."body" IS NEW."body" AND OLD."status" IS NEW."status" AND OLD."created_at" IS NEW."created_at" AND OLD."read_at" IS NEW."read_at" AND OLD."community_id" IS NEW."community_id" AND OLD."deep_link" IS NEW."deep_link" AND OLD."push_enqueued_at" IS NEW."push_enqueued_at")
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('user_notifications',json_object('id',NEW."id"),'update',json_object('id',OLD."id",'user_id',OLD."user_id",'type',OLD."type",'actor_user_id',OLD."actor_user_id",'actor_user_name',OLD."actor_user_name",'entity_id',OLD."entity_id",'title',OLD."title",'body',OLD."body",'status',OLD."status",'created_at',OLD."created_at",'read_at',OLD."read_at",'community_id',OLD."community_id",'deep_link',OLD."deep_link",'push_enqueued_at',OLD."push_enqueued_at"),json_object('id',NEW."id",'user_id',NEW."user_id",'type',NEW."type",'actor_user_id',NEW."actor_user_id",'actor_user_name',NEW."actor_user_name",'entity_id',NEW."entity_id",'title',NEW."title",'body',NEW."body",'status',NEW."status",'created_at',NEW."created_at",'read_at',NEW."read_at",'community_id',NEW."community_id",'deep_link',NEW."deep_link",'push_enqueued_at',NEW."push_enqueued_at")); END;
DROP TRIGGER "journal_user_notifications_delete";
CREATE TRIGGER "journal_user_notifications_delete" AFTER DELETE ON "user_notifications"
WHEN OLD.type <> 'organization_event' AND NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('user_notifications',json_object('id',OLD."id"),'delete',json_object('id',OLD."id",'user_id',OLD."user_id",'type',OLD."type",'actor_user_id',OLD."actor_user_id",'actor_user_name',OLD."actor_user_name",'entity_id',OLD."entity_id",'title',OLD."title",'body',OLD."body",'status',OLD."status",'created_at',OLD."created_at",'read_at',OLD."read_at",'community_id',OLD."community_id",'deep_link',OLD."deep_link",'push_enqueued_at',OLD."push_enqueued_at"),NULL); END;
