-- Organization-specific participation metadata; never grants account or IAM access.
CREATE TABLE organization_volunteer_awards (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL, awarded_by TEXT NOT NULL, awarded_at TEXT NOT NULL,
 expires_at TEXT NOT NULL, PRIMARY KEY(organization_id,user_id)
);
CREATE INDEX organization_volunteer_expiry ON organization_volunteer_awards(expires_at);
-- Restricted conduct ballots, separate from publicly listed governance motions.
CREATE TABLE organization_personnel_motions (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 target_user_id TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('exclude','readmit')),
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','discussion','voting','passed','failed','withdrawn')),
 proposer_id TEXT NOT NULL, seconder_id TEXT, chair_id TEXT, procedure_note TEXT,
 electorate_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(electorate_json)),
 voting_deadline TEXT, result_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 review_at TEXT NOT NULL
);
CREATE INDEX organization_personnel_motion_target ON organization_personnel_motions(organization_id,target_user_id,status,updated_at);
CREATE TABLE organization_personnel_votes (
 motion_id TEXT NOT NULL REFERENCES organization_personnel_motions(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL, choice TEXT NOT NULL CHECK(choice IN ('yea','nay','abstain')),
 cast_at TEXT NOT NULL, PRIMARY KEY(motion_id,user_id)
);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('organization_volunteer_awards','Expiring private participation awards; excluded from immutable history and public replication'),
 ('organization_personnel_motions','Restricted conduct ballots with a two-year review clock and verified account erasure; excluded from immutable history and public replication'),
 ('organization_personnel_votes','Restricted personnel ballots cascade with motions; excluded from immutable history and public replication');
