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
    let status: Record<string, unknown> = { active: true, ...payload, canonical_user_id:'alice', account_id:'alice',account_subject:payload.sub };
    globalThis.fetch = async (url, options) => {
      assert.equal(url, env.MCP_OAUTH_INTROSPECTION_URL);
      assert.equal(options?.redirect, 'manual');
      assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer resource-secret');
      assert.equal(new URLSearchParams(String(options?.body)).get('resource'), resource);
      return Response.json(status);
    };
    assert.equal((await authenticateMcp(request, env, async () => publicKey)).userId, 'alice');
    for (const invalid of [{ active: false }, { ...payload, active: true, sub: 'owner:bob' }, { ...payload, active: true, scope: 'org:events.read' }, {active:true,...payload,canonical_user_id:'alice',account_id:'alice',account_subject:'owner:other'}, {active:true,...payload,account_id:'alice',account_subject:payload.sub}]) {
      status = invalid;
      await assert.rejects(authenticateMcp(request, env, async () => publicKey), (e: any) => e.status === 401);
    }
    globalThis.fetch = async () => { throw new Error('secret provider detail'); };
    await assert.rejects(authenticateMcp(request, env, async () => publicKey), (e: any) => e.status === 503 && !e.message.includes('secret'));
    for (const httpStatus of [301, 302, 307, 308, 401, 500]) {
      let calls = 0;
      globalThis.fetch = async (_url, options) => {
        calls++;
        assert.equal(options?.redirect, 'manual');
        return new Response(null, { status: httpStatus, headers: { location: 'https://untrusted.example/token' } });
      };
      await assert.rejects(authenticateMcp(request, env, async () => publicKey), (e: any) => e.status === 503);
      assert.equal(calls, 1);
    }
    assert.throws(() => mcpConfiguration({ ...env, MCP_OAUTH_INTROSPECTION_SECRET: undefined }), /introspection/);
    assert.throws(() => mcpConfiguration({ ...env, MCP_OAUTH_INTROSPECTION_URL: 'https://evil.example/collect' }), /introspection/);
  } finally { globalThis.fetch = original; }
});

test('approved PIdP namespaces preserve account IDs, reject other namespaces, and require live verification', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const issuer = 'https://identity.example'; const resource = 'https://portal.example/mcp';
  const id = '46d3aec0-d4f4-46fc-860e-3fb7a82702ba';
  const env = { MCP_PUBLIC_URL: resource, MCP_OAUTH_ISSUER: issuer, PIDP_BASE_URL: issuer,
    MCP_OAUTH_JWKS_URL: `${issuer}/jwks`, MCP_SUBJECT_MAP_JSON: '{}',
    MCP_PIDP_ACCOUNT_NAMESPACES_JSON: '["owner"]',
    MCP_PIDP_PORTAL_ACCOUNT_NAMESPACE: 'website:portal',
    MCP_OAUTH_INTROSPECTION_URL: `${issuer}/oauth/mcp/introspect`, MCP_OAUTH_INTROSPECTION_SECRET: 'secret' } as Env;
  const original = globalThis.fetch;
  try {
    for (const subject of [`owner:${id}`, `website:portal:${id}`, `website:other:${id}`, 'owner:not-an-id']) {
      const payload = { sub: subject, iss: issuer, aud: resource, scope: 'org:portal.read', exp: Math.floor(Date.now()/1000)+300 };
      const token = await new SignJWT(payload).setProtectedHeader({alg:'ES256'}).setIssuedAt().sign(privateKey);
      const request = new Request(resource, {headers:{authorization:`Bearer ${token}`}});
      globalThis.fetch = async () => Response.json({active:true,...payload,canonical_user_id:id,account_id:id,account_subject:subject});
      if (subject === `owner:${id}` || subject === `website:portal:${id}`) {
        assert.equal((await authenticateMcp(request,env,async()=>publicKey)).userId,id);
        const mapped = {...env,MCP_SUBJECT_MAP_JSON:JSON.stringify({[subject]:'explicit-account'})};
        assert.equal((await authenticateMcp(request,mapped,async()=>publicKey)).userId,id);
        globalThis.fetch = async () => Response.json({active:false});
        await assert.rejects(authenticateMcp(request,env,async()=>publicKey),(e:any)=>e.status===401);
      } else await assert.rejects(authenticateMcp(request,env,async()=>publicKey),(e:any)=>e.status===401);
    }
    const linkedSubject='website:portal:876f2a42-a5e1-4aac-a57b-187c420f748a';
    const linkedPayload={sub:linkedSubject,iss:issuer,aud:resource,scope:'org:portal.read',exp:Math.floor(Date.now()/1000)+300};
    const linkedToken=await new SignJWT(linkedPayload).setProtectedHeader({alg:'ES256'}).setIssuedAt().sign(privateKey);
    globalThis.fetch=async()=>Response.json({active:true,...linkedPayload,canonical_user_id:id,account_id:linkedSubject.split(':').at(-1),account_subject:linkedSubject});
    assert.equal((await authenticateMcp(new Request(resource,{headers:{authorization:`Bearer ${linkedToken}`}}),env,async()=>publicKey)).userId,id);
    assert.throws(()=>mcpConfiguration({...env,PIDP_BASE_URL:'https://other.example'}),/namespace/);
    assert.throws(()=>mcpConfiguration({...env,MCP_OAUTH_INTROSPECTION_URL:undefined,MCP_OAUTH_INTROSPECTION_SECRET:undefined}),/namespace/);
    assert.throws(()=>mcpConfiguration({...env,MCP_PIDP_ACCOUNT_NAMESPACES_JSON:'["website:"]'}),/namespace/);
    assert.throws(()=>mcpConfiguration({...env,MCP_PIDP_PORTAL_ACCOUNT_NAMESPACE:'website:'}),/namespace/);
  } finally { globalThis.fetch = original; }
});
