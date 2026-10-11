import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { authenticateMcp, handleEventMcp, protectedResourceMetadata, mcpConfiguration, eventErrorResponse } from '../src/eventMcp';
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
    assert.ok(!denied.headers.get('www-authenticate')!.includes('invalid_token'));
    assert.ok(denied.headers.get('www-authenticate')!.includes(new URL(resource).host));
    assert.ok(!denied.headers.get('www-authenticate')!.includes(new URL(resource === medtech ? lifetech : medtech).host));
  }
});

test('expired tokens return the invalid_token challenge so clients can refresh', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const keySet = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });
  const token = await new SignJWT({ scope: 'org:portal.read' }).setProtectedHeader({ alg: 'ES256' })
    .setIssuer(env.MCP_OAUTH_ISSUER!).setSubject('member').setAudience(lifetech)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 600).setExpirationTime(Math.floor(Date.now() / 1000) - 1).sign(privateKey);
  const req = request(lifetech, '/mcp', { authorization: `Bearer ${token}` });
  let rejection: unknown;
  try { await authenticateMcp(req, env, keySet); } catch (error) { rejection = error; }
  assert.ok(rejection);
  const response = eventErrorResponse(rejection, env, req);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate')!, /error="invalid_token"/);
  assert.match(response.headers.get('www-authenticate')!, /lifetech\.fyi/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
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
    for (const tool of tools) {
      assert.deepEqual(tool.securitySchemes, tool._meta.securitySchemes);
      assert.equal(tool.securitySchemes[0].type, 'oauth2');
      assert.ok(tool.securitySchemes[0].scopes.length > 0);
      for (const hint of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) assert.equal(typeof tool.annotations[hint], 'boolean');
    }
    const scopedEnv = env as unknown as { DB: D1Database };
    scopedEnv.DB = { prepare() { return { bind() { return {
      first: async () => ({ requests: 1 }),
      all: async () => ({ results: [{ id: 'medtech-org' }, { id: 'lifetech-org' }] }),
    }; } }; } } as unknown as D1Database;
    const organizations = (await rpc('tools/call', { name: 'list_organizations', arguments: {} })).result.structuredContent.organizations;
    assert.deepEqual(organizations, [{ id: 'lifetech-org' }]);
    for (const name of ['get_organization_profile','preview_organization_profile','apply_organization_profile','get_organization_profile_operation']) assert.ok(tools.some((t: any) => t.name === name));
    assert.ok(tools.some((t: any) => t.name === 'preview_motion'));
    assert.ok(!tools.some((t: any) => t.name === 'apply_organization_creation'));
    for (const [name, args] of [
      ['get_organization_profile', { organizationId: 'medtech-org' }],
      ['preview_organization_profile', { organizationId: 'medtech-org', description: 'Test' }],
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

 test('OrgPortal platform resource has its own audience and no organization restriction', async () => {
  const resource = 'https://orgportal.cc/api/org/mcp';
  const platformEnv = { ...env, MCP_ORGPORTAL_INTROSPECTION_SECRET: 'platform-secret', MCP_RESOURCE_CONFIG_JSON: JSON.stringify({ ...JSON.parse(env.MCP_RESOURCE_CONFIG_JSON!), [resource]: { name: 'OrgPortal', introspectionSecretBinding: 'MCP_ORGPORTAL_INTROSPECTION_SECRET' } }) };
  const config = mcpConfiguration(platformEnv, request(resource));
  assert.equal(config.resource, resource);
  assert.equal(config.organizationId, undefined);
  assert.equal(config.introspectionSecret, 'platform-secret');
  const metadata = await app.fetch(request(resource, '/.well-known/oauth-protected-resource/api/org/mcp'), platformEnv);
  assert.equal(metadata.status, 200);
  assert.equal((await metadata.json() as any).resource, resource);
  assert.equal((await handleEventMcp(request(resource), platformEnv)).status, 401);
});

test('MCP failure telemetry excludes credentials and user-controlled data', async () => {
  const entries: string[] = [];
  const original = console.info;
  console.info = value => entries.push(String(value));
  try {
    const response = await handleEventMcp(new Request('https://worker.example/mcp?private=do-not-log', {
      method: 'POST', headers: { 'x-forwarded-host': 'lifetech.fyi', 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'secret-method', params: { private: 'do-not-log' } }),
    }), env);
    assert.equal(response.status, 401);
    const entry = entries.map(value => JSON.parse(value)).find(value => value.event === 'orgportal.mcp.request');
    assert.equal(entry.outcome, 'error');
    assert.equal(entry.status, 401);
    assert.deepEqual(Object.keys(entry).sort(), ['durationMs', 'event', 'method', 'outcome', 'status']);
    assert.ok(!JSON.stringify(entry).includes('do-not-log'));
    assert.ok(!JSON.stringify(entry).includes('secret-method'));
  } finally { console.info = original; }
});

test('operator authority comes only from live primary-account introspection, never token claims or website accounts', async () => {
  const {privateKey,publicKey}=await generateKeyPair('ES256');const keySet=createLocalJWKSet({keys:[await exportJWK(publicKey)]});const originalFetch=globalThis.fetch;
  try{
    for(const subject of ['owner:admin','website:site:admin']){
      const token=await new SignJWT({scope:'org:portal.read org:portal.write',is_sysadmin:true}).setProtectedHeader({alg:'ES256'}).setIssuer(env.MCP_OAUTH_ISSUER!).setSubject(subject).setAudience(lifetech).setIssuedAt().setExpirationTime('5m').sign(privateKey);
      const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());const config={...env,MCP_SUBJECT_MAP_JSON:JSON.stringify({[subject]:'admin'})};
      for(const authority of [false,true]){
        globalThis.fetch=async()=>Response.json({active:true,canonical_user_id:'admin',account_id:'admin',account_subject:subject,sub:subject,iss:payload.iss,aud:lifetech,scope:payload.scope,exp:payload.exp,is_sysadmin:authority});
        const identity=await authenticateMcp(request(lifetech,'/mcp',{authorization:`Bearer ${token}`}),config,keySet);
        assert.equal(identity.isOperator,authority&&subject.startsWith('owner:'));
      }
    }
  }finally{globalThis.fetch=originalFetch;}
});
