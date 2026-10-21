import assert from 'node:assert/strict';
import test from 'node:test';
import { readCurrentSchemaFileSync as readFileSync } from './helpers/currentSchema';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { runOrganizationDirectoryOperation as run, type OrganizationOperationContext } from '../src/organizationDirectoryOperations';
import { claimOrganization } from '../src/organizationIam';
import { runOrganizationOperation } from '../src/organizationMcp';

const operator: OrganizationOperationContext = { actor: { id: 'operator', name: 'Operator', email: null, isOperator: true }, scopes: ['org:portal.read', 'org:portal.write'] };
const owner: OrganizationOperationContext = { actor: { id: 'owner', name: 'Owner', email: null, isOperator: false }, scopes: operator.scopes };
function setup() {
  const db = new TimebankDatabase();
  for (const migration of ['0002_org_event_directories.sql', '0015_organization_iam.sql', '0017_event_mcp_operations.sql'])
    db.sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS group_sites(id TEXT PRIMARY KEY,home_org_slug TEXT,feature_config TEXT DEFAULT '{}'); CREATE TABLE IF NOT EXISTS onboarding_enrollments(group_site_id TEXT,user_id TEXT,completed_at TEXT); ALTER TABLE organization_memberships ADD COLUMN pending_organizer INTEGER DEFAULT 0; ALTER TABLE organization_memberships ADD COLUMN onboarding_group_site_id TEXT;");
  return db;
}
async function owned(db: TimebankDatabase) {
  db.sqlite.prepare('INSERT INTO organizations(id,name,slug,city) VALUES(?,?,?,?)').run('org', 'Example', 'example', 'Baltimore');
  await claimOrganization(db.asD1(), 'org', owner.actor, '2026-10-20T12:00:00Z');
}
const registration = { name: 'Third Party', description: 'Public company description', website: 'https://company.example', sourceUrl: 'https://company.example/about' };

test('directory reads expose public data, paginate equal names, and bind cursors to searches', async () => {
  const db = setup();
  try {
    for (const [id, name] of [['a', 'Same'], ['b', 'Same'], ['c', 'Third'], ['z', '100% Health']])
      db.sqlite.prepare('INSERT INTO organizations(id,name,slug) VALUES(?,?,?)').run(id, name, id);
    const page = await run(db.asD1(), owner, 'search', { limit: 1 }) as { organizations: { id: string }[]; nextCursor: string };
    assert.equal(page.organizations[0].id, 'z');
    const second = await run(db.asD1(), owner, 'search', { limit: 1, cursor: page.nextCursor }) as typeof page;
    assert.equal(second.organizations[0].id, 'a');
    const third = await run(db.asD1(), owner, 'search', { limit: 1, cursor: second.nextCursor }) as typeof page;
    assert.equal(third.organizations[0].id, 'b');
    await assert.rejects(run(db.asD1(), owner, 'search', { query: 'different', cursor: second.nextCursor }), /Invalid directory cursor/);
    await assert.rejects(run(db.asD1(), owner, 'search', { limit: 101 }));
    const percent = await run(db.asD1(), owner, 'search', { query: '%' }) as typeof page;
    assert.deepEqual(percent.organizations.map(row => row.id), ['z']);
    const detail = await run(db.asD1(), owner, 'get', { organizationId: 'a' });
    assert.doesNotMatch(JSON.stringify(detail), /user_id|user_email|ownerUserId/);
    assert.match(JSON.stringify(detail), /not_recorded/);
    await assert.rejects(run(db.asD1(), { ...owner, scopes: [] }, 'get', { organizationId: 'a' }), /scope/);
  } finally { db.sqlite.close(); }
});

test('registration is operator-only and never substitutes owned creation or grants permissions', async () => {
  const db = setup();
  try {
    await assert.rejects(run(db.asD1(), owner, 'register', registration), /Operator access/);
    await assert.rejects(run(db.asD1(), { ...operator, organizationId: 'tenant' }, 'register', registration), /unrestricted/);
    await assert.rejects(run(db.asD1(), { ...operator, scopes: ['org:portal.read'] }, 'register', registration), /scope/);
    const preview = await run(db.asD1(), operator, 'register', registration) as { previewId: string; effects: { createsOwnership: boolean } };
    assert.equal(preview.effects.createsOwnership, false);
    const applied = await run(db.asD1(), operator, 'register', { ...registration, previewId: preview.previewId, confirm: true }) as { organizationId: string };
    for (const table of ['organization_ownerships', 'organization_memberships']) assert.equal(db.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n, 0);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM organizations').get()!.n, 1);
    const audit = db.sqlite.prepare('SELECT metadata_json FROM audit_events').get()!.metadata_json as string;
    assert.ok(!audit.includes(registration.description));
    assert.ok(audit.includes(registration.sourceUrl));
    await assert.rejects(run(db.asD1(), operator, 'register', { ...registration, website: 'https://company.example/' }), /already exists/);
    const status = await run(db.asD1(), operator, 'status', { organizationId: 'organization:registry', previewId: preview.previewId });
    assert.match(JSON.stringify(status), /completed/);
    assert.ok(applied.organizationId);
  } finally { db.sqlite.close(); }
});

test('two competing registration previews cannot create duplicate organizations', async () => {
  const db = setup();
  try {
    const first = await run(db.asD1(), operator, 'register', registration) as { previewId: string };
    const second = await run(db.asD1(), operator, 'register', registration) as { previewId: string };
    await run(db.asD1(), operator, 'register', { ...registration, confirm: true, previewId: first.previewId });
    await assert.rejects(run(db.asD1(), operator, 'register', { ...registration, confirm: true, previewId: second.previewId }), /already exists/);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM organizations').get()!.n, 1);
  } finally { db.sqlite.close(); }
});

test('release preserves directory data and other members while removing only the current owner access', async () => {
  const db = setup();
  try {
    await owned(db);
    db.sqlite.prepare("INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES('org','colleague','administrator','active')").run();
    const args = { organizationId: 'org', reason: 'incorrect_association' };
    const preview = await run(db.asD1(), owner, 'release', args) as { previewId: string; effects: { otherActiveMembershipCount: number } };
    assert.equal(preview.effects.otherActiveMembershipCount, 1);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM organization_ownerships').get()!.n, 1);
    await run(db.asD1(), owner, 'release', { ...args, confirm: true, previewId: preview.previewId });
    assert.equal(db.sqlite.prepare('SELECT name FROM organizations WHERE id=\'org\'').get()!.name, 'Example');
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM organization_ownerships').get()!.n, 0);
    assert.equal(db.sqlite.prepare("SELECT status FROM organization_memberships WHERE user_id='owner'").get()!.status, 'inactive');
    assert.equal(db.sqlite.prepare("SELECT role FROM organization_memberships WHERE user_id='colleague'").get()!.role, 'administrator');
    const audit = db.sqlite.prepare("SELECT metadata_json FROM audit_events WHERE action='organization.ownership.released'").get()!.metadata_json as string;
    assert.match(audit, /incorrect_association/);
    assert.match(audit, /ownershipId/);
    assert.match(JSON.stringify(await run(db.asD1(), owner, 'status', { organizationId: 'org', previewId: preview.previewId })), /completed/);
    await assert.rejects(run(db.asD1(), operator, 'status', { organizationId: 'org', previewId: preview.previewId }), /not found/);
    await assert.rejects(run(db.asD1(), owner, 'release', { ...args, confirm: true, previewId: preview.previewId }), /current owner/);
  } finally { db.sqlite.close(); }
});

test('release rejects administrators, operators acting for someone else, tenant escape, expired and changed previews', async () => {
  const db = setup();
  try {
    await owned(db);
    const args = { organizationId: 'org', reason: 'incorrect_association' };
    await assert.rejects(run(db.asD1(), operator, 'release', args), /current owner/);
    await assert.rejects(run(db.asD1(), { ...owner, organizationId: 'other' }, 'release', args), /own organization/);
    const preview = await run(db.asD1(), owner, 'release', args) as { previewId: string };
    await assert.rejects(run(db.asD1(), owner, 'release', { ...args, reason: 'no_longer_representing', confirm: true, previewId: preview.previewId }), /expired|changed/);
    db.sqlite.prepare('UPDATE event_mcp_operations SET expires_at=0 WHERE id=?').run(preview.previewId);
    await assert.rejects(run(db.asD1(), owner, 'release', { ...args, confirm: true, previewId: preview.previewId }), /expired|changed/);
    const fresh = await run(db.asD1(), owner, 'release', args) as { previewId: string };
    db.sqlite.prepare("UPDATE organizations SET updated_at='new' WHERE id='org'").run();
    await assert.rejects(run(db.asD1(), owner, 'release', { ...args, confirm: true, previewId: fresh.previewId }), /expired|changed/);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM organization_ownerships').get()!.n, 1);
  } finally { db.sqlite.close(); }
});

test('release refuses configured portals and ownership challenge history', async () => {
  const db = setup();
  try {
    await owned(db);
    const args = { organizationId: 'org', reason: 'incorrect_association' };
    db.sqlite.prepare("UPDATE group_sites SET home_org_slug='example' WHERE id='code-collective'").run();
    await assert.rejects(run(db.asD1(), owner, 'release', args), /managed authority review/);
    db.sqlite.prepare('UPDATE group_sites SET home_org_slug=NULL').run();
    db.sqlite.prepare("INSERT INTO organization_ownership_challenges(id,organization_id,ownership_id,challenger_user_id,explanation,status,created_at) SELECT 'challenge','org',id,'challenger','Synthetic challenge','open','now' FROM organization_ownerships").run();
    await assert.rejects(run(db.asD1(), owner, 'release', args), /managed authority review/);
  } finally { db.sqlite.close(); }
});

test('owned creation previews expose the permission grant and require explicit intent', async () => {
  const db = setup();
  try {
    const args = { name: 'My Organization', city: 'Baltimore' };
    const create = async () => ({ id: 'new' });
    const identity = { userId: owner.actor.id, scopes: owner.scopes };
    const preview = await runOrganizationOperation(db.asD1(), identity, 'create', args, create) as { previewId: string; effects: { ownerUserId: string; createsOwnership: boolean } };
    assert.equal(preview.effects.ownerUserId, 'owner');
    assert.equal(preview.effects.createsOwnership, true);
    await assert.rejects(runOrganizationOperation(db.asD1(), identity, 'create', { ...args, confirm: true, previewId: preview.previewId }, create), /directory registration/);
  } finally { db.sqlite.close(); }
});

test('release rechecks live authority inside the transaction and does not partially write', async () => {
  const db = setup();
  try {
    await owned(db);
    const args = { organizationId: 'org', reason: 'incorrect_association' };
    const preview = await run(db.asD1(), owner, 'release', args) as { previewId: string };
    const original = db.batch.bind(db);
    db.batch = async statements => {
      db.sqlite.prepare("UPDATE organization_memberships SET role='member' WHERE user_id='owner'").run();
      return original(statements);
    };
    await assert.rejects(run(db.asD1(), owner, 'release', { ...args, confirm: true, previewId: preview.previewId }), /Authority changed/);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM organization_ownerships').get()!.n, 1);
    assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM audit_events WHERE action='organization.ownership.released'").get()!.n, 0);
    assert.equal(db.sqlite.prepare("SELECT status FROM organization_memberships WHERE user_id='owner'").get()!.status, 'active');
  } finally { db.sqlite.close(); }
});
