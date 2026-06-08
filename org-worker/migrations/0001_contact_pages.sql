CREATE TABLE IF NOT EXISTS user_contact_pages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  user_email TEXT,
  user_name TEXT,
  slug TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 0,
  headline TEXT,
  bio TEXT,
  photo_url TEXT,
  email_public TEXT,
  phone_public TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  x_url TEXT,
  website_url TEXT,
  links TEXT NOT NULL DEFAULT '[]',
  source_profile_url TEXT,
  source_profile_imported_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_user_contact_pages_slug ON user_contact_pages(slug);
CREATE INDEX IF NOT EXISTS idx_user_contact_pages_user_id ON user_contact_pages(user_id);
