import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";
import {
  OrganizationIamError,
  authorizeOrganization,
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
    this.database.exec("CREATE TABLE portal_tenants (id TEXT PRIMARY KEY, home_org_slug TEXT, feature_config TEXT NOT NULL DEFAULT '{}');\n CREATE TABLE onboarding_enrollments (tenant_id TEXT, user_id TEXT, completed_at TEXT, PRIMARY KEY(tenant_id,user_id));");
    this.database.exec(readFileSync(new URL("../migrations/0067_pending_organizers.sql", import.meta.url), "utf8"));
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
  assert.equal(await authorizeOrganization(db, owner, 'manage', 'org-1'), 'owner');
  assert.equal((await claimOrganization(db, 'org-1', owner, '2026-08-08T12:00:01.000Z')).id, ownership.id);

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

test("active community members see the complete roster without emails or management rights", async () => {
  const sqlite = new SqliteD1();
  const db = asD1(sqlite);
  try {
    await claimOrganization(db, 'org-1', owner, '2026-10-05T12:00:00Z');
    await saveOrganizationMember(db, 'org-1', owner, {
      user_id: challenger.id, user_name: challenger.name, user_email: 'private@example.test', role: 'member',
    }, '2026-10-05T12:01:00Z');
    const roster = await listOrganizationMembers(db, 'org-1', challenger);
    assert.equal(roster.length, 2);
    assert.ok(roster.every(member => !('user_email' in member)));
    assert.equal((await listOrganizationMembers(db, 'org-1', owner)).find(member => member.user_id === challenger.id)?.user_email, 'private@example.test');
    await saveOrganizationMember(db, 'org-1', owner, { user_id: supporter.id, user_name: supporter.name, role: 'administrator' }, '2026-10-05T12:01:00Z');
    const unchanged = await saveOrganizationMember(db, 'org-1', owner, { user_id: supporter.id, user_name: 'Overwritten', role: 'member', add_only: true }, '2026-10-05T12:02:00Z');
    assert.equal(unchanged?.role, 'administrator');
    assert.equal(unchanged?.user_name, supporter.name);
    await assert.rejects(() => saveOrganizationMember(db, 'org-1', challenger, { user_id: 'third-person' }, '2026-10-05T12:02:00Z'),
      (error: unknown) => error instanceof OrganizationIamError && error.status === 403);
    sqlite.database.prepare("UPDATE organization_memberships SET status='inactive' WHERE user_id=?").run(challenger.id);
    await assert.rejects(() => listOrganizationMembers(db, 'org-1', challenger),
      (error: unknown) => error instanceof OrganizationIamError && error.status === 403);
  } finally { sqlite.database.close(); }
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

test('membership reconciliation grants only the explicit account after an unchanged one-use preview', async t => {
  const { app } = await import('../src/index');
  const database = new SqliteD1();
  t.after(() => database.database.close());
  database.database.exec(readFileSync(new URL('../migrations/0017_event_mcp_operations.sql', import.meta.url), 'utf8'));
  await claimOrganization(asD1(database), 'org-1', owner, '2026-10-05T12:00:00Z');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => Response.json({
    id: new Headers(init?.headers).get('authorization') === 'Bearer owner' ? owner.id : 'website-member',
    email: owner.email, full_name: 'Same person', is_sysadmin: false,
  });
  t.after(() => { globalThis.fetch = originalFetch; });
  const environment = { DB: asD1(database), PIDP_BASE_URL: 'https://id.local.test' } as Env;
  const payload = {user_id: 'website-member', user_name: 'Same person', user_email: owner.email, role: 'administrator'};
  const request = (operation: string, token: string, body = payload) => app.request(
    `https://org.local.test/api/network/orgs/org-1/members/${operation}`,
    {method: 'POST', headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'}, body: JSON.stringify(body)}, environment);
  assert.equal((await request('preview', 'member')).status, 403, 'matching email provides no authority');
  const response = await request('preview', 'owner');
  assert.equal(response.status, 200);
  const preview = await response.json() as {previewId: string};
  assert.equal(database.database.prepare("SELECT role FROM organization_memberships WHERE user_id='website-member'").get(), undefined);
  assert.equal((await request('apply', 'owner', {...payload, user_id: 'different-account', previewId: preview.previewId} as typeof payload)).status, 409);
  assert.equal((await request('apply', 'owner', {...payload, previewId: preview.previewId} as typeof payload)).status, 200);
  assert.equal(database.database.prepare("SELECT role FROM organization_memberships WHERE user_id='website-member'").get()!.role, 'administrator');
  assert.equal(database.database.prepare('SELECT role FROM organization_memberships WHERE user_id=?').get(owner.id)!.role, 'owner');
  assert.equal((await request('apply', 'owner', {...payload, previewId: preview.previewId} as typeof payload)).status, 409);
});

test('organizer nominations retain member permissions until onboarding and authorized activation', async () => {
  const db = new SqliteD1();
  db.database.exec(`INSERT INTO portal_tenants VALUES ('tenant', 'open-organization', '{"onboarding":{"enabled":true}}')`);
  await claimOrganization(asD1(db), 'org-1', owner, '2026-10-05T00:00:00Z');
  await assert.rejects(saveOrganizationMember(asD1(db), 'org-1', supporter, { user_id: 'candidate', role: 'administrator' }, 'now'), /permission|manage|access/i);
  const pending = await saveOrganizationMember(asD1(db), 'org-1', owner, { user_id: 'candidate', role: 'administrator' }, 'now') as any;
  assert.equal(pending.role, 'member'); assert.equal(pending.pending_organizer, 1);
  await assert.rejects(authorizeOrganization(asD1(db), { ...supporter, id: 'candidate' }, 'manage', 'org-1'), /permission|manage|access/i);
  await saveOrganizationMember(asD1(db), 'org-1', owner, { user_id: 'candidate', role: 'member', add_only: true }, 'now');
  assert.equal((await listOrganizationMembers(asD1(db), 'org-1', owner)).find(row => row.user_id === 'candidate')?.pending_organizer, 1);
  db.database.exec(`INSERT INTO onboarding_enrollments VALUES ('tenant', 'candidate', 'done')`);
  await assert.rejects(authorizeOrganization(asD1(db), { ...supporter, id: 'candidate' }, 'manage', 'org-1'), /permission|manage|access/i);
  const active = await saveOrganizationMember(asD1(db), 'org-1', owner, { user_id: 'candidate', role: 'administrator' }, 'now') as any;
  assert.equal(active.role, 'administrator'); assert.equal(active.pending_organizer, 0);
  await authorizeOrganization(asD1(db), { ...supporter, id: 'candidate' }, 'manage', 'org-1');
  db.database.close();
});
