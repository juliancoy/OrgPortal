import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { syncEverythingRoutes } from '../src/syncEverything';
import { handleEventMcp } from '../src/eventMcp';

async function fixture(t: any, realDispatch = false) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE organizations(id TEXT,name TEXT,slug TEXT);
    CREATE TABLE organization_memberships(organization_id TEXT,user_id TEXT,status TEXT,role TEXT);
    CREATE TABLE event_mcp_rate_limits(actor_user_id TEXT PRIMARY KEY,window_start INTEGER,requests INTEGER);
    INSERT INTO organizations VALUES('life','LifeTech','lifetech'),('other','Other','other');
    INSERT INTO organization_memberships VALUES('life','canonical','active','owner');`);
  for (const [column, definition] of Object.entries({ description: 'TEXT', image_url: 'TEXT', city: 'TEXT', tags: "TEXT DEFAULT '[]'", links_json: "TEXT DEFAULT '[]'", media_json: "TEXT DEFAULT '[]'", updated_at: 'TEXT' })) sql.exec(`ALTER TABLE organizations ADD COLUMN ${column} ${definition}`);
  const DB = { prepare(query: string) {
    const stmt = sql.prepare(query);
    const bound = (args: any[]): any => ({ bind: (...next: any[]) => bound(next), first: async () => stmt.get(...args),
      all: async () => ({ results: stmt.all(...args) }), run: async () => stmt.run(...args) });
    return bound([]);
  } } as unknown as D1Database;
  const resource = 'https://lifetech.fyi/api/org/mcp';
  const env = { DB, MCP_PUBLIC_URL: resource, MCP_OAUTH_ISSUER: 'https://identity.sync.test',
    MCP_OAUTH_JWKS_URL: `https://identity.sync.test/${crypto.randomUUID()}/jwks`,
    MCP_SUBJECT_MAP_JSON: '{"signed-subject":"canonical"}', MCP_OAUTH_INTROSPECTION_URL: 'https://identity.sync.test/oauth/mcp/introspect',
    MCP_OAUTH_INTROSPECTION_SECRET: 'private-introspection-key', MCP_RESOURCE_CONFIG_JSON: JSON.stringify({ [resource]: { name: 'LifeTech', organizationId: 'life' } }) } as unknown as Env;
  const { privateKey, publicKey } = await generateKeyPair('ES256'), jwk = await exportJWK(publicKey);
  let active = true, domainError = false;
  const calls: Array<Record<string, any>> = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo, init: RequestInit) => {
    if (String(url).endsWith('/jwks')) return Response.json({ keys: [jwk] });
    const token = new URLSearchParams(init.body as string).get('token')!;
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return Response.json({ active, ...claims, canonical_user_id: 'canonical', account_id: 'account', account_subject: claims.sub });
  });
  const reads = ['get_organization_profile','get_portal_setup','get_portal_branding','list_organization_members',
    'get_organization_personnel_scheme','list_organization_invitations','list_my_personnel_relationships',
    'list_organization_support','list_motions','list_events','get_organization_page_statistics'];
  const routes = syncEverythingRoutes(async request => {
    if (realDispatch) return handleEventMcp(request, env);
    const body = await request.json() as any;
    if (body.method === 'tools/list') return Response.json({ result: { tools: [...reads.map(name => ({ name, inputSchema: { properties: {} }, annotations: { readOnlyHint: true } })),
      ...['preview','apply'].map(mode => ({ name: mode + '_organization_profile', inputSchema: { properties: { confirm: {}, previewId: {} } } }))] } });
    calls.push(body.params);
    return Response.json({ result: domainError ? { isError: true, content: [{ type: 'text', text: 'Denied by domain permissions' }] }
      : { structuredContent: { organization: { id: 'life' }, previewId: '11111111-1111-4111-8111-111111111111' } } });
  });
  const request = async (body: unknown, scopes = 'org:portal.read org:portal.write', authenticated = true) => {
    const token = await new SignJWT({ scope: scopes }).setProtectedHeader({ alg: 'ES256' }).setSubject('signed-subject')
      .setIssuer(env.MCP_OAUTH_ISSUER!).setAudience(resource).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    return routes.request('https://lifetech.fyi/everything', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }, env);
  };
  t.after(() => sql.close());
  return { request, calls, env, sql, revoke: () => { active = false; }, denyDomain: () => { domainError = true; } };
}

test('sync requires live authenticated membership and exact tenant scope', async t => {
  const f = await fixture(t), body = { organizationId: 'life', mode: 'catalog' };
  assert.equal((await f.request(body, '', false)).status, 401);
  assert.equal((await f.request(body, 'org:events.read')).status, 403);
  assert.equal((await f.request({ ...body, organizationId: 'other' })).status, 403);
  f.sql.exec("UPDATE organization_memberships SET status='revoked'");
  assert.equal((await f.request(body)).status, 403);
  f.revoke(); assert.equal((await f.request(body)).status, 401);
  assert.equal(f.calls.length, 0);
});

test('pull continuations are signed, tenant bound and never dispatch writes', async t => {
  const f = await fixture(t);
  const response = await f.request({ organizationId: 'life', limit: 1 });
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const page = await response.json() as any;
  assert.equal(page.cycleComplete, false); assert.equal(page.coverage.complete, false);
  assert.ok(page.nextCursor.includes('.'));
  assert.ok(!JSON.stringify(page).includes('private-introspection-key'));
  const [payload, signature] = page.nextCursor.split('.');
  const altered = JSON.parse(Buffer.from(payload, 'base64').toString()); altered.expiresAt += 86400000;
  const forged = Buffer.from(JSON.stringify(altered)).toString('base64') + '.' + signature;
  assert.equal((await f.request({ organizationId: 'life', cursor: forged })).status, 400);
  assert.equal((await f.request({ organizationId: 'life', cursor: page.nextCursor, limit: 1 })).status, 200);
  assert.ok(f.calls.every(call => call.name.startsWith('get_') && call.arguments.organizationId === 'life'));
});

test('writes require scopes and exact domain receipts and reject injected target fields', async t => {
  const f = await fixture(t), operation = { name: 'organization_profile', arguments: { city: 'Baltimore' } };
  assert.equal((await f.request({ organizationId: 'life', mode: 'preview', operation }, 'org:portal.read')).status, 403);
  assert.equal((await f.request({ organizationId: 'life', mode: 'apply', operation })).status, 409);
  assert.equal((await f.request({ organizationId: 'life', mode: 'preview', operation: { ...operation, arguments: { organizationId: 'other' } } })).status, 400);
  assert.equal((await f.request({ organizationId: 'life', mode: 'apply', operation: { name: 'identity_password', arguments: {} } })).status, 400);
  const preview = await f.request({ organizationId: 'life', mode: 'preview', operation }); assert.equal(preview.status, 200);
  assert.equal(f.calls.at(-1)?.name, 'preview_organization_profile'); assert.equal(f.calls.at(-1)?.arguments.confirm, false);
  const previewId = '11111111-1111-4111-8111-111111111111';
  assert.equal((await f.request({ organizationId: 'life', mode: 'apply', operation: { ...operation, previewId } })).status, 200);
  assert.deepEqual(f.calls.at(-1), { name: 'apply_organization_profile', arguments: { city: 'Baltimore', organizationId: 'life', confirm: true, previewId } });
});

test('domain denials remain explicit and local replicas cannot serve sync', async t => {
  const f = await fixture(t); f.denyDomain();
  const response = await f.request({ organizationId: 'life', limit: 1 });
  const page = await response.json() as any; assert.equal(page.records[0].result.isError, true);
  assert.equal(page.cycleComplete, false);
  f.env.ORGANIZATION_REPLICA_SOURCE = 'https://primary.test/snapshot';
  assert.equal((await f.request({ organizationId: 'life' })).status, 409);
});

test('real in-process MCP transport discovers tools and pulls an authorized domain record', async t => {
  const f = await fixture(t, true);
  const catalog = await f.request({ organizationId: 'life', mode: 'catalog' });
  assert.equal(catalog.status, 200);
  assert.ok((await catalog.json() as any).operations.includes('organization_profile'));
  const response = await f.request({ organizationId: 'life', limit: 1 });
  assert.equal(response.status, 200);
  const page = await response.json() as any;
  assert.equal(page.records[0].result.isError, undefined);
  assert.equal(page.records[0].result.structuredContent.organization.name, 'LifeTech');
});
