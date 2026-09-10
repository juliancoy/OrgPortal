CREATE TABLE IF NOT EXISTS organization_feedback (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT,
  rating TEXT NOT NULL DEFAULT 'neutral' CHECK (rating IN ('positive', 'neutral', 'concern')),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_feedback_org
  ON organization_feedback(organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_organization_feedback_user
  ON organization_feedback(user_id, updated_at DESC);

INSERT OR IGNORE INTO organization_feedback (organization_id, user_id, user_name, rating, comment, created_at, updated_at)
SELECT
  organization_id,
  user_id,
  user_name,
  CASE sentiment WHEN 'favor' THEN 'positive' ELSE 'concern' END,
  '',
  created_at,
  updated_at
FROM organization_sentiments
