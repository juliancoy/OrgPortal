-- Reviewed one-time outreach stays separate from subscription consent.
ALTER TABLE email_campaigns ADD COLUMN audience_mode TEXT NOT NULL DEFAULT 'subscribers' CHECK(audience_mode IN ('subscribers','outreach'));
ALTER TABLE email_campaigns ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 50 CHECK(batch_size BETWEEN 1 AND 100);
ALTER TABLE email_campaigns ADD COLUMN batch_limit INTEGER NOT NULL DEFAULT 50;
ALTER TABLE email_campaigns ADD COLUMN content_json TEXT;
ALTER TABLE email_campaigns ADD COLUMN report_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN import_key TEXT;
ALTER TABLE email_campaigns ADD COLUMN expires_at INTEGER;
CREATE UNIQUE INDEX email_campaign_import ON email_campaigns(owner_user_id,organization_id,import_key) WHERE import_key IS NOT NULL;
ALTER TABLE email_deliveries ADD COLUMN source_url TEXT;
ALTER TABLE email_deliveries ADD COLUMN source_checked_at TEXT;
ALTER TABLE email_deliveries ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved' CHECK(review_status IN ('approved','held'));
ALTER TABLE email_deliveries ADD COLUMN bounced_at INTEGER;
ALTER TABLE email_deliveries ADD COLUMN bounce_notice_id TEXT;
CREATE UNIQUE INDEX email_campaign_recipient ON email_deliveries(campaign_id,email) WHERE kind='campaign';
CREATE TABLE email_bounces (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 email TEXT NOT NULL, reason TEXT NOT NULL, source_message_id TEXT NOT NULL,
 first_seen_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(organization_id,email)
);
ALTER TABLE email_senders ADD COLUMN can_read_bounces INTEGER NOT NULL DEFAULT 0;
CREATE TABLE email_bounce_receipts (
 owner_user_id TEXT NOT NULL, message_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
 PRIMARY KEY(owner_user_id,message_id)
);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('email_bounces','private address-level delivery failures; retained while group exists; annual review; never subscription consent'),
 ('email_bounce_receipts','private processed Gmail notice identifiers; expires in 30 days');
ALTER TABLE email_deliveries ADD COLUMN dns_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE email_senders ADD COLUMN bounce_page_token TEXT;
-- Campaign content, photos and Google-account state must follow private-store
-- retention; future edits must not create permanent journal copies.
DROP TRIGGER journal_email_campaigns_insert;
DROP TRIGGER journal_email_campaigns_update;
DROP TRIGGER journal_email_campaigns_delete;
DROP TRIGGER journal_email_senders_insert;
DROP TRIGGER journal_email_senders_update;
DROP TRIGGER journal_email_senders_delete;
DELETE FROM change_journal_coverage WHERE table_name IN ('email_campaigns','email_senders');
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('email_campaigns','private outreach content and histories expire after 90 days; existing minimal mailing audit retained separately'),
 ('email_senders','private Google connection state; minimal email audit only; credentials never copied');
