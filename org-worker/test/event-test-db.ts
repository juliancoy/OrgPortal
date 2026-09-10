import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

// Exercise actual SQL and migration semantics, not a string-matching storage mock.
export class EventTestDb {
  private sqlite = new DatabaseSync(":memory:");
  constructor() {
    this.sqlite.exec(readFileSync(new URL("../migrations/0017_event_mcp_operations.sql", import.meta.url), "utf8"));
    this.sqlite.exec(`CREATE TABLE organizations (id TEXT, name TEXT, slug TEXT, source_url TEXT);
      CREATE TABLE organization_memberships (organization_id TEXT, user_id TEXT, role TEXT, status TEXT);
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
        host_org_id TEXT,
        host_org_name TEXT,
        host_org_source_url TEXT,
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
