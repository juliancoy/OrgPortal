import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

// Exercise actual SQL and migration semantics, not a string-matching storage mock.
export class EventTestDb {
  private sqlite = new DatabaseSync(":memory:");
  constructor() {
    this.sqlite.exec(readFileSync(new URL("../migrations/0017_event_mcp_operations.sql", import.meta.url), "utf8"));
    this.sqlite.exec(`CREATE TABLE organizations (id TEXT, name TEXT, slug TEXT);
      CREATE TABLE organization_memberships (organization_id TEXT, user_id TEXT, role TEXT, status TEXT);
      INSERT INTO organizations VALUES ('org-one', 'One', 'one');
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
