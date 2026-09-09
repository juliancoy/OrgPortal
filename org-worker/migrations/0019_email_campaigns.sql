CREATE TABLE email_senders (
  owner_user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  refresh_token_ciphertext TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected' CHECK(status IN ('connected', 'reconnect')),
  connected_at INTEGER NOT NULL,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT
);

CREATE TABLE email_oauth_states (
  state_hash TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  expected_email TEXT NOT NULL,
  browser_hash TEXT NOT NULL,
  verifier_ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_email_oauth_expiry ON email_oauth_states(expires_at);

CREATE TABLE email_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  topic_type TEXT NOT NULL CHECK(topic_type IN ('event', 'organization')),
  topic_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('subscribed', 'unsubscribed')),
  consent_source TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(email, topic_type, topic_id)
);
CREATE INDEX idx_email_subscriptions_topic ON email_subscriptions(topic_type, topic_id, status);
CREATE INDEX idx_email_subscriptions_user ON email_subscriptions(user_id);

CREATE TABLE email_campaigns (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_json TEXT NOT NULL,
  audience TEXT NOT NULL CHECK(audience IN ('event', 'organization', 'selected')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'queued', 'paused', 'completed')),
  scheduled_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  queued_at INTEGER
);
CREATE INDEX idx_email_campaigns_owner ON email_campaigns(owner_user_id, created_at);
CREATE INDEX idx_email_campaigns_due ON email_campaigns(status, scheduled_at);

CREATE TABLE email_deliveries (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL,
  subscription_id TEXT REFERENCES email_subscriptions(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('campaign', 'test')),
  status TEXT NOT NULL CHECK(status IN ('draft', 'queued', 'sending', 'sent', 'failed', 'uncertain', 'skipped')),
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  attempted_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  gmail_message_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  UNIQUE(campaign_id, subscription_id)
);
CREATE INDEX idx_email_deliveries_pending ON email_deliveries(sender_user_id, status, next_attempt_at);
CREATE INDEX idx_email_deliveries_campaign ON email_deliveries(campaign_id, status);
CREATE UNIQUE INDEX idx_email_deliveries_pending_test ON email_deliveries(campaign_id)
  WHERE kind = 'test' AND status IN ('queued', 'sending');

-- Every Gmail submission reserves a slot, including tests and failed attempts.
CREATE TABLE email_send_attempts (
  id TEXT PRIMARY KEY,
  sender_user_id TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);
CREATE INDEX idx_email_send_attempts_window ON email_send_attempts(sender_user_id, attempted_at);
