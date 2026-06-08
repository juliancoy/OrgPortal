CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  source_url TEXT,
  image_url TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  city TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_name ON organizations(name);
CREATE INDEX IF NOT EXISTS idx_organizations_source_url ON organizations(source_url);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ingest_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  starts_at TEXT,
  ends_at TEXT,
  location TEXT,
  source_url TEXT,
  image_url TEXT,
  host_org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  host_org_name TEXT,
  host_org_source_url TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  city TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_host_org_id ON events(host_org_id);
CREATE INDEX IF NOT EXISTS idx_events_ingest_key ON events(ingest_key);
