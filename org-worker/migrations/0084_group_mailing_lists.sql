-- Explicit group email consent and private, bounded organizer tooling.
DROP TRIGGER "journal_email_subscriptions_insert";
DROP TRIGGER "journal_email_subscriptions_update";
DROP TRIGGER "journal_email_subscriptions_delete";
ALTER TABLE email_subscriptions ADD COLUMN consented_at INTEGER;
ALTER TABLE email_subscriptions ADD COLUMN unsubscribed_at INTEGER;
UPDATE change_journal_coverage SET columns_json='["id", "user_id", "email", "name", "topic_type", "topic_id", "status", "consent_source", "updated_at", "consented_at", "unsubscribed_at"]' WHERE table_name='email_subscriptions';
CREATE TRIGGER journal_email_subscriptions_insert AFTER INSERT ON email_subscriptions
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
VALUES('email_subscriptions',json_object('id',NEW.id),'insert',NULL,json_object('id',NEW."id",'user_id',NEW."user_id",'email',NEW."email",'name',NEW."name",'topic_type',NEW."topic_type",'topic_id',NEW."topic_id",'status',NEW."status",'consent_source',NEW."consent_source",'updated_at',NEW."updated_at",'consented_at',NEW."consented_at",'unsubscribed_at',NEW."unsubscribed_at")); END;
CREATE TRIGGER journal_email_subscriptions_update AFTER UPDATE ON email_subscriptions
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."id" IS NEW."id" AND OLD."user_id" IS NEW."user_id" AND OLD."email" IS NEW."email" AND OLD."name" IS NEW."name" AND OLD."topic_type" IS NEW."topic_type" AND OLD."topic_id" IS NEW."topic_id" AND OLD."status" IS NEW."status" AND OLD."consent_source" IS NEW."consent_source" AND OLD."updated_at" IS NEW."updated_at" AND OLD."consented_at" IS NEW."consented_at" AND OLD."unsubscribed_at" IS NEW."unsubscribed_at") BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
VALUES('email_subscriptions',json_object('id',NEW.id),'update',json_object('id',OLD."id",'user_id',OLD."user_id",'email',OLD."email",'name',OLD."name",'topic_type',OLD."topic_type",'topic_id',OLD."topic_id",'status',OLD."status",'consent_source',OLD."consent_source",'updated_at',OLD."updated_at",'consented_at',OLD."consented_at",'unsubscribed_at',OLD."unsubscribed_at"),json_object('id',NEW."id",'user_id',NEW."user_id",'email',NEW."email",'name',NEW."name",'topic_type',NEW."topic_type",'topic_id',NEW."topic_id",'status',NEW."status",'consent_source',NEW."consent_source",'updated_at',NEW."updated_at",'consented_at',NEW."consented_at",'unsubscribed_at',NEW."unsubscribed_at")); END;
CREATE TRIGGER journal_email_subscriptions_delete AFTER DELETE ON email_subscriptions
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
VALUES('email_subscriptions',json_object('id',OLD.id),'delete',json_object('id',OLD."id",'user_id',OLD."user_id",'email',OLD."email",'name',OLD."name",'topic_type',OLD."topic_type",'topic_id',OLD."topic_id",'status',OLD."status",'consent_source',OLD."consent_source",'updated_at',OLD."updated_at",'consented_at',OLD."consented_at",'unsubscribed_at',OLD."unsubscribed_at"),NULL); END;
CREATE TABLE email_segments (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name TEXT NOT NULL, subscription_ids_json TEXT NOT NULL CHECK(json_valid(subscription_ids_json)),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX email_segments_group ON email_segments(organization_id,expires_at);
CREATE TABLE email_mailing_audit (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, actor_user_id TEXT NOT NULL,
 action TEXT NOT NULL, target_id TEXT, record_count INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX email_mailing_audit_expiry ON email_mailing_audit(expires_at);
CREATE INDEX email_mailing_audit_group ON email_mailing_audit(organization_id,created_at);
CREATE TABLE email_campaign_previews (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
 organization_id TEXT NOT NULL, actor_user_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
 expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE INDEX email_campaign_previews_expiry ON email_campaign_previews(expires_at);
INSERT INTO change_journal_exclusions VALUES
 ('email_segments','private subscriber selections expire after one year; access and changes audited without selections'),
 ('email_mailing_audit','minimal email audit expires after one year; do not duplicate into immutable journal'),
 ('email_campaign_previews','short lived one use email send receipts');
