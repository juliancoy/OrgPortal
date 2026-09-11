import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

// Exercise actual SQL and migration semantics, not a string-matching storage mock.
export class EventTestDb {
  private sqlite = new DatabaseSync(":memory:");
  constructor() {
    this.sqlite.exec(readFileSync(new URL("../migrations/0017_event_mcp_operations.sql", import.meta.url), "utf8"));
    this.sqlite.exec(`CREATE TABLE organizations (id TEXT, name TEXT, slug TEXT, source_url TEXT);
      CREATE TABLE organization_memberships (organization_id TEXT, user_id TEXT, role TEXT, status TEXT);
      CREATE TABLE portal_tenants (
        id TEXT PRIMARY KEY,
        organization_id TEXT,
        slug TEXT UNIQUE,
        hostname TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        tagline TEXT NOT NULL,
        accent_color TEXT NOT NULL DEFAULT '#155e59',
        profile TEXT NOT NULL DEFAULT 'community',
        features TEXT NOT NULL DEFAULT '[]',
        brand_image_path TEXT,
        home_url TEXT,
        member_home_path TEXT,
        manifest_path TEXT,
        theme_color TEXT,
        home_kind TEXT NOT NULL DEFAULT 'default',
        home_path TEXT,
        home_org_slug TEXT,
        home_heading TEXT,
        home_description TEXT,
        home_primary_label TEXT,
        home_primary_href TEXT,
        home_secondary_label TEXT,
        home_secondary_href TEXT,
        home_image_url TEXT,
        public_base_url TEXT,
        canonical_path_prefix TEXT NOT NULL DEFAULT '',
        feature_config TEXT NOT NULL DEFAULT '{}',
        custom_domain_hostname TEXT,
        custom_domain_status TEXT NOT NULL DEFAULT 'none',
        custom_domain_requested_at TEXT,
        custom_domain_attached_at TEXT,
        custom_domain_notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE events (
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
        social_title TEXT,
        social_description TEXT,
        social_image_url TEXT,
        host_org_id TEXT,
        host_org_name TEXT,
        host_org_source_url TEXT,
        event_chat_room_id TEXT,
        event_chat_room_alias TEXT,
        event_chat_room_name TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        city TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        host_user_id TEXT,
        host_user_name TEXT
      );
      INSERT INTO organizations VALUES ('org-one', 'One', 'one', 'https://one.example');
      INSERT INTO organization_memberships VALUES ('org-one', 'pidp-user', 'owner', 'active');`);
  }
  prepare(sql: string) {
    const stmt = this.sqlite.prepare(sql);
    const bound = (values: any[]) => ({
      first: async () => stmt.get(...values) || null,
      run: async () => stmt.run(...values),
      all: async () => ({ results: stmt.all(...values) }),
      bind: (...next: any[]) => bound(next),
    });
    return bound([]);
  }
  close() { this.sqlite.close(); }
}
