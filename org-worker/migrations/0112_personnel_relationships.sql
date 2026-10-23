-- Reviewed: private invitation intent and consented, time-bounded relationships.
ALTER TABLE organization_invitations ADD COLUMN intent_json TEXT CHECK(intent_json IS NULL OR json_valid(intent_json));
ALTER TABLE organization_invitations ADD COLUMN delivery_blocker TEXT;
CREATE TABLE organization_personnel_relationships (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL, scheme TEXT NOT NULL, class_key TEXT NOT NULL,
 user_name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','pending_confirmation')),
 accepted_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 evidence_url TEXT, confirmed_by TEXT,
 PRIMARY KEY(organization_id,user_id,scheme,class_key)
);
CREATE INDEX personnel_relationship_expiry ON organization_personnel_relationships(expires_at);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES('organization_personnel_relationships','Consented personnel relationships and private supporting evidence: expire after 24 months, revocable and removable on privacy request; excluded from immutable history and replication');
