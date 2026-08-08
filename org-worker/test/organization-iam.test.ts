import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";
import {
  OrganizationIamError,
  claimOrganization,
  createOwnershipChallenge,
  listAuditEvents,
  listOrganizationMembers,
  listOwnershipChallenges,
  resolveOwnershipChallenge,
  saveOrganizationMember,
  supportOwnershipChallenge,
  type OrganizationActor,
} from "../src/organizationIam";

class SqliteD1Statement {
  constructor(private readonly statement: StatementSync, private readonly parameters: unknown[] = []) {}
  bind(...parameters: unknown[]) { return new SqliteD1Statement(this.statement, parameters); }
  async first<T>() { return (this.statement.get(...this.parameters) as T | undefined) || null; }
  async all<T>() { return { results: this.statement.all(...this.parameters) as T[] }; }
  async run() {
    const result = this.statement.run(...this.parameters);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class SqliteD1 {
  readonly database = new DatabaseSync(":memory:");
  constructor() {
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec(readFileSync(new URL("../migrations/0002_org_event_directories.sql", import.meta.url), "utf8"));
    this.database.exec(readFileSync(new URL("../migrations/0015_organization_iam.sql", import.meta.url), "utf8"));
    this.database.exec(`
      INSERT INTO organizations (id, name, slug, tags)
      VALUES ('org-1', 'Open Organization', 'open-organization', '[]');
    `);
  }
  prepare(sql: string) { return new SqliteD1Statement(this.database.prepare(sql)); }
  async batch(statements: SqliteD1Statement[]) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function asD1(database: SqliteD1) { return database as unknown as D1Database; }

const owner: OrganizationActor = {
  id: "member-owner",
  name: "Original Owner",
  email: "owner@example.test",
  isOperator: false,
};

const challenger: OrganizationActor = {
  id: "member-challenger",
  name: "New Owner",
  email: "challenger@example.test",
  isOperator: false,
};

const supporter: OrganizationActor = {
  id: "member-supporter",
  name: "Community Supporter",
  email: "supporter@example.test",
  isOperator: false,
};

const operator: OrganizationActor = {
  id: "operator-1",
  name: "Platform Operator",
  email: "operator@example.test",
  isOperator: true,
};

test("the public organization-admin response does not select member email addresses", () => {
  const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const route = source.match(/app\.get\("\/api\/network\/orgs\/public\/:slug\/admins"[\s\S]*?\n\}\);/);
  assert.ok(route);
  assert.doesNotMatch(route[0], /user_email/);
});

test("the first authenticated claimant immediately becomes owner", async () => {
  const sqlite = new SqliteD1();
  const db = asD1(sqlite);

  const ownership = await claimOrganization(db, "org-1", owner, "2026-08-08T12:00:00.000Z");
  assert.equal(ownership.owner_user_id, owner.id);

  const members = await listOrganizationMembers(db, "org-1", owner);
  assert.deepEqual(members.map((member) => [member.user_id, member.role]), [[owner.id, "owner"]]);

  await assert.rejects(
    () => claimOrganization(db, "org-1", challenger, "2026-08-08T12:01:00.000Z"),
    (error: unknown) => error instanceof OrganizationIamError && error.status === 409,
  );
  await assert.rejects(
    () => listOrganizationMembers(db, "org-1", challenger),
    (error: unknown) => error instanceof OrganizationIamError && error.status === 403,
  );
});

test("a challenge marks ownership disputed and resolution transfers without rewriting history", async () => {
  const sqlite = new SqliteD1();
  const db = asD1(sqlite);
  await claimOrganization(db, "org-1", owner, "2026-08-08T12:00:00.000Z");
  await saveOrganizationMember(db, "org-1", owner, {
    user_id: supporter.id,
    user_name: supporter.name,
    user_email: supporter.email,
    role: "administrator",
  }, "2026-08-08T12:01:00.000Z");

  const challenge = await createOwnershipChallenge(db, "org-1", challenger, {
    explanation: "I am the current elected representative.",
    evidence: ["https://example.test/election-result"],
  }, "2026-08-08T12:02:00.000Z");
  await supportOwnershipChallenge(db, challenge.id, supporter, "challenger", "2026-08-08T12:03:00.000Z");

  const open = await listOwnershipChallenges(db, supporter, { organizationId: "org-1", status: "open" });
  assert.equal(open.length, 1);
  assert.equal(open[0].challenger_support_count, 1);
  assert.deepEqual(open[0].evidence, ["https://example.test/election-result"]);

  await resolveOwnershipChallenge(db, challenge.id, operator, "challenger", "2026-08-08T12:04:00.000Z");
  const ownerships = sqlite.database.prepare(
    "SELECT owner_user_id, status, ended_at FROM organization_ownerships WHERE organization_id = ? ORDER BY started_at",
  ).all("org-1") as Array<{ owner_user_id: string; status: string; ended_at: string | null }>;
  assert.deepEqual(ownerships.map((row) => [row.owner_user_id, row.status]), [
    [owner.id, "transferred"],
    [challenger.id, "active"],
  ]);
  assert.equal(ownerships[0].ended_at, "2026-08-08T12:04:00.000Z");

  const members = await listOrganizationMembers(db, "org-1", challenger);
  assert.equal(members.find((member) => member.user_id === challenger.id)?.role, "owner");
  assert.equal(members.find((member) => member.user_id === owner.id)?.role, "member");
  assert.equal(members.find((member) => member.user_id === supporter.id)?.role, "administrator");

  const audit = await listAuditEvents(db, operator, 100);
  assert.ok(audit.some((event) => event.action === "organization.claimed"));
  assert.ok(audit.some((event) => event.action === "organization.ownership_challenged"));
  assert.ok(audit.some((event) => event.action === "organization.ownership_transferred"));
});
