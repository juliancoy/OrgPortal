-- Additive; no existing organization/profile/identity records are changed.
-- Public nominations and private ballots expire after one year. No immutable journal.
CREATE TABLE organization_recognition_nominees (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 submitted_by TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 accomplishment TEXT NOT NULL CHECK(length(accomplishment) BETWEEN 1 AND 2000),
 connection TEXT NOT NULL CHECK(length(connection) BETWEEN 1 AND 500),
 profile_url TEXT,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 UNIQUE(organization_id, name COLLATE NOCASE)
);
CREATE INDEX recognition_nominee_expiry ON organization_recognition_nominees(expires_at);
CREATE INDEX recognition_nominee_org ON organization_recognition_nominees(organization_id);
CREATE TABLE organization_recognition_ballots (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL,
 selections TEXT NOT NULL CHECK(json_valid(selections) AND json_type(selections)='array'),
 expires_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,user_id)
);
CREATE INDEX recognition_ballot_expiry ON organization_recognition_ballots(expires_at);
-- Removing a nomination removes its votes and trims ballots to the new 25% cap.
CREATE TRIGGER recognition_nominee_delete AFTER DELETE ON organization_recognition_nominees BEGIN
 UPDATE organization_recognition_ballots SET selections=(
  SELECT json_group_array(value) FROM (
   SELECT j.value FROM json_each(selections) j
   JOIN organization_recognition_nominees n ON n.id=j.value AND n.organization_id=OLD.organization_id
   WHERE n.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') ORDER BY j.key
   LIMIT (SELECT (COUNT(*)+3)/4 FROM organization_recognition_nominees WHERE organization_id=OLD.organization_id AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )
 ) WHERE organization_id=OLD.organization_id;
END;
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('organization_recognition_nominees','Deletable public nominations; one-year expiry; no immutable journal or replica'),
 ('organization_recognition_ballots','Private expiring ballots; never public or replicated');
