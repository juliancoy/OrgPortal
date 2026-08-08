CREATE TABLE IF NOT EXISTS organization_memberships (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT,
  user_email TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'administrator', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_memberships_user
  ON organization_memberships(user_id, status, role);

CREATE TABLE IF NOT EXISTS organization_ownerships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'transferred')),
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_ownerships_one_active
  ON organization_ownerships(organization_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_organization_ownerships_owner
  ON organization_ownerships(owner_user_id, status);

CREATE TABLE IF NOT EXISTS organization_ownership_challenges (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ownership_id TEXT NOT NULL REFERENCES organization_ownerships(id),
  challenger_user_id TEXT NOT NULL,
  challenger_name TEXT,
  challenger_email TEXT,
  explanation TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('open', 'withdrawn', 'resolved')),
  resolution TEXT CHECK (resolution IN ('incumbent', 'challenger')),
  resolved_by_user_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_challenges_one_open_per_challenger
  ON organization_ownership_challenges(organization_id, challenger_user_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_organization_challenges_queue
  ON organization_ownership_challenges(status, created_at);

CREATE TABLE IF NOT EXISTS organization_ownership_challenge_support (
  challenge_id TEXT NOT NULL REFERENCES organization_ownership_challenges(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT,
  position TEXT NOT NULL CHECK (position IN ('incumbent', 'challenger')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (challenge_id, user_id)
);

CREATE TABLE IF NOT EXISTS record_access_grants (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  grantee_user_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_record_access_grants_lookup
  ON record_access_grants(grantee_user_id, resource_type, resource_id, revoked_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  subject_user_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created
  ON audit_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_resource
  ON audit_events(resource_type, resource_id, created_at DESC);
