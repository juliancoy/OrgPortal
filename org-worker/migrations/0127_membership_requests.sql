CREATE TABLE organization_membership_requests (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX idx_membership_requests_expiry ON organization_membership_requests(expires_at);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('organization_membership_requests','Private membership requests expire after 30 days; excluded from immutable history and public replication.');
