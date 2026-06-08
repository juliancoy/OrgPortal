CREATE TABLE IF NOT EXISTS governance_motions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('main', 'amendment')),
  parent_motion_id TEXT REFERENCES governance_motions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  proposed_body_diff TEXT,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'seconded', 'discussion', 'voting', 'passed', 'failed', 'tabled', 'withdrawn')),
  proposer_type TEXT NOT NULL DEFAULT 'user' CHECK (proposer_type IN ('user', 'org')),
  proposer_id TEXT NOT NULL,
  proposer_name TEXT NOT NULL,
  proposer_user_name TEXT,
  proposer_org_id TEXT,
  proposer_org_name TEXT,
  seconder_id TEXT,
  seconder_name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  discussion_deadline TEXT,
  voting_deadline TEXT,
  quorum_required INTEGER NOT NULL DEFAULT 5,
  result TEXT
);

CREATE INDEX IF NOT EXISTS idx_governance_motions_status ON governance_motions(status);
CREATE INDEX IF NOT EXISTS idx_governance_motions_type ON governance_motions(type);
CREATE INDEX IF NOT EXISTS idx_governance_motions_parent ON governance_motions(parent_motion_id);
CREATE INDEX IF NOT EXISTS idx_governance_motions_created_at ON governance_motions(created_at);

CREATE TABLE IF NOT EXISTS governance_votes (
  id TEXT PRIMARY KEY,
  motion_id TEXT NOT NULL REFERENCES governance_motions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  choice TEXT NOT NULL CHECK (choice IN ('yea', 'nay', 'abstain')),
  cast_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(motion_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_governance_votes_motion ON governance_votes(motion_id);

CREATE TABLE IF NOT EXISTS governance_comments (
  id TEXT PRIMARY KEY,
  motion_id TEXT NOT NULL REFERENCES governance_motions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_governance_comments_motion ON governance_comments(motion_id);

CREATE TABLE IF NOT EXISTS governance_engagement_votes (
  motion_id TEXT NOT NULL REFERENCES governance_motions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (motion_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_governance_engagement_motion ON governance_engagement_votes(motion_id);

INSERT OR IGNORE INTO governance_motions (
  id, type, parent_motion_id, title, body, proposed_body_diff, status,
  proposer_type, proposer_id, proposer_name, created_at, updated_at,
  discussion_deadline, voting_deadline, quorum_required, result
) VALUES
(
  'mot-ranked-choice',
  'main',
  NULL,
  'Adopt Ranked-Choice Voting for Board Elections',
  'Proposal to implement ranked-choice voting (RCV) for all future board elections. Under RCV, voters rank candidates in order of preference, and votes are redistributed in rounds until a candidate achieves a majority.',
  NULL,
  'discussion',
  'user',
  'user-alice',
  'Alice Johnson',
  '2026-06-04T12:00:00.000Z',
  '2026-06-05T12:00:00.000Z',
  '2026-06-11T12:00:00.000Z',
  NULL,
  5,
  NULL
),
(
  'mot-park-fund',
  'main',
  NULL,
  'Allocate Community Fund for Park Restoration',
  'Motion to allocate $50,000 from the community development fund toward park restoration.',
  NULL,
  'proposed',
  'user',
  'user-carlos',
  'Carlos Rivera',
  '2026-06-06T12:00:00.000Z',
  '2026-06-06T12:00:00.000Z',
  NULL,
  NULL,
  5,
  NULL
),
(
  'mot-annual-budget',
  'main',
  NULL,
  'Approve Annual Budget Report for Fiscal Year 2025',
  'Motion to approve the annual budget report for fiscal year 2025.',
  NULL,
  'passed',
  'user',
  'user-diana',
  'Diana Park',
  '2026-05-24T12:00:00.000Z',
  '2026-05-31T12:00:00.000Z',
  '2026-05-28T12:00:00.000Z',
  '2026-05-31T12:00:00.000Z',
  5,
  '{"yea":5,"nay":1,"abstain":1,"total_votes":7}'
);

INSERT OR IGNORE INTO governance_votes (id, motion_id, user_id, user_name, choice, cast_at) VALUES
  ('vote-annual-budget-alice', 'mot-annual-budget', 'user-alice', 'Alice Johnson', 'yea', '2026-05-30T12:00:00.000Z'),
  ('vote-annual-budget-bob', 'mot-annual-budget', 'user-bob', 'Bob Smith', 'yea', '2026-05-30T12:00:00.000Z'),
  ('vote-annual-budget-carlos', 'mot-annual-budget', 'user-carlos', 'Carlos Rivera', 'yea', '2026-05-30T12:00:00.000Z'),
  ('vote-annual-budget-frank', 'mot-annual-budget', 'user-frank', 'Frank Lee', 'nay', '2026-05-31T12:00:00.000Z'),
  ('vote-annual-budget-grace', 'mot-annual-budget', 'user-grace', 'Grace Chen', 'abstain', '2026-05-31T12:00:00.000Z');
