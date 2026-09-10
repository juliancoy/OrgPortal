import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPair, SignJWT } from 'jose';
import { authenticateMcp, mcpConfiguration } from '../src/eventMcp';

test('PIdP signed tokens require matching live status; revocation and outages fail closed', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const issuer = 'https://identity.example'; const resource = 'https://portal.example/mcp';
  const exp = Math.floor(Date.now() / 1000) + 300;
  const payload = { sub: 'owner:alice', iss: issuer, aud: resource, scope: 'org:events.read org:events.write', exp };
  const token = await new SignJWT(payload).setProtectedHeader({ alg: 'ES256' }).setIssuedAt().sign(privateKey);
  const env = { MCP_PUBLIC_URL: resource, MCP_OAUTH_ISSUER: issuer, MCP_OAUTH_JWKS_URL: `${issuer}/.well-known/jwks.json`,
    MCP_SUBJECT_MAP_JSON: '{"owner:alice":"alice"}', MCP_OAUTH_INTROSPECTION_URL: `${issuer}/oauth/mcp/introspect`,
    MCP_OAUTH_INTROSPECTION_SECRET: 'resource-secret' } as Env;
  const request = new Request(resource, { headers: { authorization: `Bearer ${token}` } });
  const original = globalThis.fetch;
  try {
    let status: Record<string, unknown> = { active: true, ...payload };
    globalThis.fetch = async (url, options) => {
      assert.equal(url, env.MCP_OAUTH_INTROSPECTION_URL);
      assert.equal(options?.redirect, 'error');
      assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer resource-secret');
      assert.equal(new URLSearchParams(String(options?.body)).get('resource'), resource);
      return Response.json(status);
    };
    assert.equal((await authenticateMcp(request, env, async () => publicKey)).userId, 'alice');
    for (const invalid of [{ active: false }, { ...payload, active: true, sub: 'owner:bob' }, { ...payload, active: true, scope: 'org:events.read' }]) {
      status = invalid;
      await assert.rejects(authenticateMcp(request, env, async () => publicKey), (e: any) => e.status === 401);
    }
    globalThis.fetch = async () => { throw new Error('secret provider detail'); };
    await assert.rejects(authenticateMcp(request, env, async () => publicKey), (e: any) => e.status === 503 && !e.message.includes('secret'));
    assert.throws(() => mcpConfiguration({ ...env, MCP_OAUTH_INTROSPECTION_SECRET: undefined }), /introspection/);
    assert.throws(() => mcpConfiguration({ ...env, MCP_OAUTH_INTROSPECTION_URL: 'https://evil.example/collect' }), /introspection/);
  } finally { globalThis.fetch = original; }
});
