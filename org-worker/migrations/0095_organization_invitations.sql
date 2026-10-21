CREATE TABLE organization_invitations (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 email TEXT NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('member','volunteer')),
 invited_by TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', accepted_user_id TEXT,
 email_status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
 attempted_at INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX organization_invitation_expiry ON organization_invitations(expires_at);
CREATE UNIQUE INDEX organization_invitation_pending ON organization_invitations(organization_id,email,purpose) WHERE status='pending';
INSERT INTO change_journal_exclusions(table_name,reason) VALUES ('organization_invitations','Private seven-day email invitations; excluded from immutable history and public replication');
