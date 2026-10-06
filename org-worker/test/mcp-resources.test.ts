import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { authenticateMcp, handleEventMcp, protectedResourceMetadata } from '../src/eventMcp';
import { app } from '../src/index';
import { authorizeMcpOrganization } from '../src/mediaUpload';
const medtech = 'https://medtech.social/api/org/mcp', lifetech = 'https://lifetech.fyi/api/org/mcp';
const env = {
  MCP_PUBLIC_URL: medtech, MCP_OAUTH_ISSUER: 'https://id.example', MCP_OAUTH_JWKS_URL: 'https://id.example/separate-jwks',
  MCP_SUBJECT_MAP_JSON: JSON.stringify({ member: 'member-id' }),
  MCP_OAUTH_INTROSPECTION_URL: 'https://id.example/oauth/mcp/introspect', MCP_OAUTH_INTROSPECTION_SECRET: 'medtech-secret',
  MCP_LIFETECH_INTROSPECTION_SECRET: 'lifetech-secret',
  MCP_RESOURCE_CONFIG_JSON: JSON.stringify({
    [medtech]: { name: 'MedTech', organizationId: 'medtech-org' },
    [lifetech]: { name: 'LifeTech', organizationId: 'lifetech-org', introspectionSecretBinding: 'MCP_LIFETECH_INTROSPECTION_SECRET' },
  }),
} as Env;
const request = (resource: string, path = '/mcp', headers: Record<string, string> = {}) => new Request(`https://worker.example${path}`, {
  headers: { 'x-forwarded-host': new URL(resource).host, ...headers },
});

test('each host advertises its own resource and authentication challenge', async () => {
  for (const resource of [medtech, lifetech]) {
    const req = request(resource, '/.well-known/oauth-protected-resource/api/org/mcp');
    assert.equal(protectedResourceMetadata(env, req).resource, resource);
    const metadata = await app.fetch(req, env);
    assert.equal((await metadata.json() as any).resource, resource);
    assert.equal(metadata.headers.get('cache-control'), 'no-store');
    const denied = await handleEventMcp(request(resource), env);
    assert.equal(denied.status, 401);
    assert.ok(denied.headers.get('www-authenticate')!.includes(new URL(resource).host));
    assert.ok(!denied.headers.get('www-authenticate')!.includes(new URL(resource === medtech ? lifetech : medtech).host));
  }
});

test('tokens cannot cross resources; introspection uses the selected resource credential', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const keySet = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });
  const originalFetch = globalThis.fetch;
  try {
    for (const resource of [medtech, lifetech]) {
      const token = await new SignJWT({ scope: 'org:portal.read' }).setProtectedHeader({ alg: 'RS256' })
        .setIssuer(env.MCP_OAUTH_ISSUER!).setSubject('member').setAudience(resource).setIssuedAt().setExpirationTime('5m').sign(privateKey);
      globalThis.fetch = async (_url, options) => {
        const form = new URLSearchParams(options!.body as string);
        assert.equal(form.get('resource'), resource);
        assert.equal((options!.headers as any).authorization, `Bearer ${resource === medtech ? 'medtech-secret' : 'lifetech-secret'}`);
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        return Response.json({ active: true, canonical_user_id:payload.sub.split(':').at(-1), account_id:payload.sub.split(':').at(-1),account_subject:payload.sub, sub: payload.sub, iss: payload.iss, aud: resource, scope: payload.scope, exp: payload.exp });
      };
      const identity = await authenticateMcp(request(resource, '/mcp', { authorization: `Bearer ${token}` }), env, keySet);
      assert.equal(identity.organizationId, resource === medtech ? 'medtech-org' : 'lifetech-org');
      await assert.rejects(authenticateMcp(request(resource === medtech ? lifetech : medtech, '/mcp', { authorization: `Bearer ${token}` }), env, keySet), /unauthorized/);
    }
    const token = await new SignJWT({ scope: 'org:portal.read' }).setProtectedHeader({ alg: 'RS256' })
      .setIssuer(env.MCP_OAUTH_ISSUER!).setSubject('member').setAudience([medtech, lifetech]).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    await assert.rejects(authenticateMcp(request(lifetech, '/mcp', { authorization: `Bearer ${token}` }), env, keySet), /unauthorized/);
  } finally { globalThis.fetch = originalFetch; }
});

test('brand tool discovery and calls cannot escape their organization, including uploads', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  const token = await new SignJWT({ scope: 'org:portal.read org:portal.write org:events.read org:events.write' }).setProtectedHeader({ alg: 'RS256' })
    .setIssuer(env.MCP_OAUTH_ISSUER!).setSubject('member').setAudience(lifetech).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes('jwks') ? Response.json({ keys: [jwk] })
    : Response.json({ active: true, canonical_user_id:payload.sub.split(':').at(-1), account_id:payload.sub.split(':').at(-1),account_subject:payload.sub, sub: payload.sub, iss: payload.iss, aud: lifetech, scope: payload.scope, exp: payload.exp });
  const rpc = async (method: string, params: unknown) => {
    const req = new Request('https://worker.example/mcp', { method: 'POST', headers: {
      'x-forwarded-host': 'lifetech.fyi', authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const response = await handleEventMcp(req, env, undefined, { read: async () => ({}), execute: async () => { throw Error('must not execute') } });
    assert.equal(response.status, 200); return response.json() as Promise<any>;
  };
  try {
    const initialize = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(initialize.result.serverInfo.name, 'LifeTech MCP');
    const tools = (await rpc('tools/list', {})).result.tools;
    const scopedEnv = env as unknown as { DB: D1Database };
    scopedEnv.DB = { prepare() { return { bind() { return {
      first: async () => ({ requests: 1 }),
      all: async () => ({ results: [{ id: 'medtech-org' }, { id: 'lifetech-org' }] }),
    }; } }; } } as unknown as D1Database;
    const organizations = (await rpc('tools/call', { name: 'list_organizations', arguments: {} })).result.structuredContent.organizations;
    assert.deepEqual(organizations, [{ id: 'lifetech-org' }]);
    assert.ok(tools.some((t: any) => t.name === 'preview_motion'));
    assert.ok(!tools.some((t: any) => t.name === 'apply_organization_creation'));
    for (const [name, args] of [
      ['get_motion', { organizationId: 'medtech-org', motionId: 'motion' }],
      ['get_event', { organizationId: 'medtech-org', eventId: 'event' }],
      ['get_portal_setup', { organizationId: 'medtech-org' }],
      ['list_organization_members', { organizationId: 'medtech-org' }],
    ] as const) {
      const result = (await rpc('tools/call', { name, arguments: args })).result;
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /own organization/);
    }
    assert.throws(() => authorizeMcpOrganization({ userId: 'member-id', scopes: [], organizationId: 'lifetech-org' }, 'medtech-org'), /own organization/);
  } finally { globalThis.fetch = originalFetch; }
});
