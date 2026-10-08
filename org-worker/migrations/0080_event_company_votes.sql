-- Company preferences are distinct from venue votes and event co-hosts.
CREATE TABLE event_company_ballots (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  closes_at TEXT NOT NULL CHECK (julianday(closes_at) IS NOT NULL),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);
CREATE TABLE event_pitch_companies (
  event_id TEXT NOT NULL REFERENCES event_company_ballots(event_id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, organization_id)
);
CREATE TABLE event_company_votes (
  event_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  expires_at TEXT NOT NULL CHECK (julianday(expires_at) IS NOT NULL),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, organization_id, user_id),
  FOREIGN KEY (event_id, organization_id) REFERENCES event_pitch_companies(event_id, organization_id) ON DELETE CASCADE
);
CREATE INDEX event_company_votes_user ON event_company_votes(user_id, event_id);
CREATE INDEX event_company_votes_expiry ON event_company_votes(expires_at);

-- Live event and company identities verified through LifeTech's public API.
-- One week after the event: 8 p.m. America/New_York on October 15, 2026.
-- No event/organization creation.
INSERT INTO event_company_ballots (event_id, closes_at)
SELECT id, '2026-10-16T00:00:00Z' FROM events
WHERE id = '15dc061b-d8a5-4cc5-ad94-e9a704c24b01'
  AND host_org_id = 'org-amplify-medtech';
INSERT INTO event_pitch_companies (event_id, organization_id)
SELECT b.event_id, o.id FROM event_company_ballots b JOIN organizations o
  ON o.id IN ('org-bluehealer', 'org-salynt', 'org-liquet-medical', 'org-rubitection', 'org-wearabledose')
WHERE b.event_id = '15dc061b-d8a5-4cc5-ad94-e9a704c24b01';
