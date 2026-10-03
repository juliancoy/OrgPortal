import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { app, governanceService, executeGovernanceAction } from '../src/index';
import { runGovernanceOperation } from '../src/governanceMcp';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const file of ['0001_contact_pages.sql', '0002_org_event_directories.sql', '0003_governance.sql', '0015_organization_iam.sql', '0017_event_mcp_operations.sql']) {
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
  } } as unknown as D1Database;
  sql.exec(`INSERT INTO organizations (id,name,slug,tags,city) VALUES ('org','LifeTech','lifetech','[]','Baltimore'),('other','Other','other','[]','Baltimore');
    INSERT INTO organization_memberships (organization_id,user_id,user_name,role,status,created_at,updated_at) VALUES
      ('org','member','Member','member','active','now','now'),('org','second','Second','member','active','now','now'),('org','admin','Admin','administrator','active','now','now'),
      ('other','outsider','Outsider','member','active','now','now');`);
  const scopes = ['org:portal.read', 'org:portal.write'];
  const run = (operation: any, args: any, userId = 'member', granted = scopes) => runGovernanceOperation(db, { userId, scopes: granted }, operation, args, governanceService(db));
  const approve = async (operation: any, args: any, user = 'member') => {
    const preview = await run(operation, args, user) as any;
    return run(operation, { ...args, confirm: true, previewId: preview.previewId }, user) as Promise<any>;
  };
  return { sql, db, run, approve };
}
const proposal = { organizationId: 'org', title: 'Hold a LifeTech meeting', body: 'Meet next Friday.', quorumRequired: 2 };

test('motion filing requires scope, membership, approval and an exact one-use receipt', async () => {
  const { sql, run } = fixture();
  try {
    await assert.rejects(run('propose', proposal, 'outsider'), /membership/);
    await assert.rejects(run('propose', proposal, 'member', ['org:portal.read']), /scope/);
    await assert.rejects(run('propose', { ...proposal, confirm: true }), /preview first/);
    const before = Number(sql.prepare('SELECT count(*) as n FROM governance_motions').get()!.n);
    const preview = await run('propose', proposal) as any;
    assert.equal(Number(sql.prepare('SELECT count(*) as n FROM governance_motions').get()!.n), before);
    await assert.rejects(run('propose', { ...proposal, body: 'Changed', confirm: true, previewId: preview.previewId }), /expired|changed/);
    await assert.rejects(run('propose', { ...proposal, confirm: true, previewId: preview.previewId }, 'second'), /belongs|expired/);
    const applied = await run('propose', { ...proposal, confirm: true, previewId: preview.previewId }) as any;
    assert.equal(applied.result.proposer_id, 'member');
    assert.equal(applied.result.proposer_org_id, 'org');
    assert.equal(applied.result.status, 'proposed');
    await assert.rejects(run('propose', { ...proposal, confirm: true, previewId: preview.previewId }), /already used/);
    const status = await run('status', { organizationId: 'org', previewId: preview.previewId }) as any;
    assert.equal(status.status, 'completed');
    await assert.rejects(run('status', { organizationId: 'org', previewId: preview.previewId }, 'second'), /not found/);
  } finally { sql.close(); }
});

test('members file amendments, second, discuss and vote; managers open and resolve voting', async () => {
  const { sql, run, approve } = fixture();
  try {
    const main = (await approve('propose', proposal)).result;
    const target = { organizationId: 'org', motionId: main.id };
    await assert.rejects(run('get', { ...target, organizationId: 'other' }, 'outsider'), /not found/);
    await assert.rejects(run('amend', { ...proposal, organizationId: 'other', parentMotionId: main.id }, 'outsider'), /not found/);
    assert.deepEqual((await run('list', { organizationId: 'other' }, 'outsider') as any).motions, []);
    await assert.rejects(run('action', { ...target, action: 'second' }), /own motion/);
    const amendment = (await approve('amend', { ...proposal, title: 'Meet on Saturday', parentMotionId: main.id })).result;
    assert.equal(amendment.parent_motion_id, main.id);
    assert.equal(amendment.type, 'amendment');
    await approve('action', { ...target, action: 'second' }, 'second');
    await assert.rejects(run('action', { ...target, action: 'open-voting' }), /management/);
    await assert.rejects(approve('action', { ...target, action: 'open-voting' }, 'admin'), /pending amendments/);
    await approve('action', { organizationId: 'org', motionId: amendment.id, action: 'withdraw' });
    await approve('action', { ...target, action: 'comment', body: 'I support this meeting.' });
    await approve('action', { ...target, action: 'open-voting' }, 'admin');
    await assert.rejects(run('action', { ...target, action: 'vote' }), /choice/);
    await approve('action', { ...target, action: 'vote', choice: 'yea' });
    await approve('action', { ...target, action: 'vote', choice: 'yea' }, 'second');
    const result = await approve('action', { ...target, action: 'resolve' }, 'admin');
    assert.equal(result.result.status, 'passed');
    assert.equal(result.result.result.quorum_met, true);
    const detail = await run('get', target) as any;
    assert.equal(detail.comments.length, 1);
    assert.equal(detail.results.yea, 2);
    await assert.rejects(run('action', { ...target, action: 'vote', choice: 'nay' }), /required state/);
  } finally { sql.close(); }
});

test('expired previews, changed motion state and revoked membership cannot be applied', async () => {
  const { sql, run, approve, db } = fixture();
  try {
    const expired = await run('propose', proposal) as any;
    sql.prepare('UPDATE event_mcp_operations SET expires_at = 0 WHERE id = ?').run(expired.previewId);
    await assert.rejects(run('propose', { ...proposal, confirm: true, previewId: expired.previewId }), /expired/);
    const main = (await approve('propose', proposal)).result;
    const target = { organizationId: 'org', motionId: main.id, action: 'second' };
    const preview = await run('action', target, 'second') as any;
    sql.prepare('UPDATE governance_motions SET body = ? WHERE id = ?').run('Changed after preview', main.id);
    await assert.rejects(run('action', { ...target, confirm: true, previewId: preview.previewId }, 'second'), /changed/);
    const next = await run('propose', proposal) as any;
    sql.exec("UPDATE organization_memberships SET status = 'inactive' WHERE user_id = 'member'");
    await assert.rejects(run('propose', { ...proposal, confirm: true, previewId: next.previewId }), /membership/);
    await assert.rejects(executeGovernanceAction(db, { id: 'outsider' }, 'vote', main.id, { choice: 'yea' }), /membership/);
  } finally { sql.close(); }
});

test('authenticated MCP advertises governance tools and files motions through the shared service', async () => {
  const { db, sql } = fixture();
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  const env = { DB: db, MCP_PUBLIC_URL: 'https://portal.example/api/org/mcp', MCP_OAUTH_ISSUER: 'https://identity.example',
    MCP_OAUTH_JWKS_URL: 'https://identity.example/governance-jwks', MCP_SUBJECT_MAP_JSON: JSON.stringify({ subject: 'member' }),
  } as Env;
  const token = await new SignJWT({ scope: 'org:portal.read org:portal.write' }).setProtectedHeader({ alg: 'RS256' })
    .setSubject('subject').setIssuer(env.MCP_OAUTH_ISSUER!).setAudience(env.MCP_PUBLIC_URL!).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [jwk] });
  const rpc = async (method: string, params: unknown) => {
    const response = await app.request('https://portal.example/mcp', { method: 'POST', headers: {
      authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }, env);
    assert.equal(response.status, 200);
    return response.json() as Promise<any>;
  };
  try {
    const tools = (await rpc('tools/list', {})).result.tools;
    for (const name of ['list_motions','get_motion','get_motion_operation','preview_motion','apply_motion','preview_motion_amendment','apply_motion_amendment','preview_motion_action','apply_motion_action']) assert.ok(tools.some((tool: any) => tool.name === name));
    const preview = (await rpc('tools/call', { name: 'preview_motion', arguments: { ...proposal, confirm: true } })).result.structuredContent;
    assert.ok(preview.previewId);
    assert.equal(Number(sql.prepare("SELECT count(*) as n FROM governance_motions WHERE proposer_org_id = 'org'").get()!.n), 0);
    const applied = (await rpc('tools/call', { name: 'apply_motion', arguments: { ...proposal, previewId: preview.previewId, confirm: true } })).result;
    assert.equal(applied.isError, undefined);
    assert.equal(applied.structuredContent.result.proposer_id, 'member');
    const read = (await rpc('tools/call', { name: 'get_motion', arguments: { organizationId: 'org', motionId: applied.structuredContent.result.id } })).result;
    assert.equal(read.structuredContent.motion.title, proposal.title);
  } finally { globalThis.fetch = originalFetch; sql.close(); }
});
