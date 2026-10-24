-- Latest verified OrgPortal use only. Private, bounded, no session/token history.
CREATE TABLE portal_account_activity (
 user_id TEXT PRIMARY KEY,
 user_name TEXT NOT NULL,
 email TEXT NOT NULL,
 last_active_at INTEGER NOT NULL
);
CREATE INDEX portal_account_activity_expiry ON portal_account_activity(last_active_at);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('portal_account_activity','Private latest authenticated activity; 90-day expiry; excluded from immutable history and public replication');
