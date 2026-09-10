CREATE TABLE IF NOT EXISTS portal_tenants (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  accent_color TEXT NOT NULL DEFAULT '#155e59',
  profile TEXT NOT NULL DEFAULT 'community',
  features TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO portal_tenants (id, hostname, name, tagline, accent_color, profile, features)
VALUES
  ('code-collective', 'codecollective.us', 'Code Collective', 'Coding a New Economy', '#12325b', 'code-collective', '["timebank","directory","events","chat","ubi"]'),
  ('bmoretimebank', 'bmoretimebank.codecollective.us', 'Bmore Timebank', 'Baltimore neighbors helping Baltimore neighbors.', '#155e59', 'community', '["timebank"]'),
  ('timebank', 'timebank.codecollective.us', 'Code Collective Timebank', 'Good neighbors. Useful skills. Time well shared.', '#155e59', 'community', '["timebank"]'),
  ('baltimore-medtech', 'medtech.social', 'Baltimore MedTech', 'Health × Medicine × Biotech', '#0f6f8f', 'baltimore-medtech', '["directory","events","chat"]'),
  ('baltimore-medtech-community', 'community.medtech.social', 'Baltimore MedTech', 'Health × Medicine × Biotech', '#0f6f8f', 'baltimore-medtech', '["directory","events","chat"]')
ON CONFLICT(hostname) DO UPDATE SET
  name = excluded.name,
  tagline = excluded.tagline,
  accent_color = excluded.accent_color,
  profile = excluded.profile,
  features = excluded.features,
  updated_at = CURRENT_TIMESTAMP;
