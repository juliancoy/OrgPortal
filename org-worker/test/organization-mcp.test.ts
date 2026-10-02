import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { runOrganizationOperation } from '../src/organizationMcp';
import { claimOrganization } from '../src/organizationIam';

function database() {
  const sql = new DatabaseSync(':memory:');
  for (const file of ['0002_org_event_directories.sql', '0015_organization_iam.sql', '0017_event_mcp_operations.sql']) {
    sql.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  const db = { prepare(query: string) {
    const statement = sql.prepare(query);
    const bound = (args: any[]) => ({ bind: (...args: any[]) => bound(args),
      first: async () => statement.get(...args) || null,
      all: async () => ({ results: statement.all(...args) }),
      run: async () => statement.run(...args),
    });
    return bound([]);
  }, async batch(statements: { run(): Promise<unknown> }[]) {
    sql.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
  return { sql, db };
}
const identity = { userId: 'existing-pidp-user', scopes: ['org:portal.read', 'org:portal.write'] };

test('organization creation requires scope and a matching one-use receipt', async () => {
  const { db, sql } = database(); let writes = 0;
  const create = async () => { writes++; return { id: 'new-org' }; };
  const args = { name: 'LifeTech', city: 'Baltimore' };
  await assert.rejects(runOrganizationOperation(db, { ...identity, scopes: ['org:portal.read'] }, 'create', args, create), /Missing portal scope/);
  await assert.rejects(runOrganizationOperation(db, identity, 'create', { ...args, confirm: true }, create), /preview first/);
  const preview = await runOrganizationOperation(db, identity, 'create', args, create) as { previewId: string };
  assert.equal(writes, 0);
  await assert.rejects(runOrganizationOperation(db, identity, 'create', { ...args, name: 'Changed', confirm: true, previewId: preview.previewId }, create), /Preview is expired/);
  await runOrganizationOperation(db, identity, 'create', { ...args, confirm: true, previewId: preview.previewId }, create);
  assert.equal(writes, 1);
  await assert.rejects(runOrganizationOperation(db, identity, 'create', { ...args, confirm: true, previewId: preview.previewId }, create), /already used/);
  sql.close();
});

test('membership writes preserve PIdP IDs and enforce organization permissions', async () => {
  const { db, sql } = database();
  sql.exec("INSERT INTO organizations (id, name, slug, tags, city) VALUES ('org', 'Existing', 'existing', '[]', 'Baltimore')");
  await claimOrganization(db, 'org', { id: identity.userId, name: 'Owner', email: null, isOperator: false }, new Date().toISOString());
  const create = async () => null;
  const args = { organizationId: 'org', user_id: 'same-pidp-member', role: 'member' };
  await assert.rejects(runOrganizationOperation(db, { ...identity, userId: 'outsider' }, 'member', args, create), /access|permission|manage/i);
  const preview = await runOrganizationOperation(db, identity, 'member', args, create) as { previewId: string };
  await runOrganizationOperation(db, identity, 'member', { ...args, confirm: true, previewId: preview.previewId }, create);
  const members = await runOrganizationOperation(db, identity, 'members', { organizationId: 'org' }, create) as { members: { user_id: string }[] };
  assert.ok(members.members.some(member => member.user_id === 'same-pidp-member'));
  await assert.rejects(runOrganizationOperation(db, identity, 'create', { name: 'Existing', city: 'Baltimore' }, create), /already exists/);
  sql.close();
});
