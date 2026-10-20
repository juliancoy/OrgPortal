import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

test('root MCP and media uploads reach the API with the public host and payload intact', async t => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(new URL(url).hostname, 'api.example');
    assert.equal(init.headers.get('x-forwarded-host'), 'orgportal.cc');
    assert.equal(init.headers.get('x-forwarded-proto'), 'https');
    assert.equal(init.body !== null, true);
    return new Response('protected', {status:401});
  });
  for (const path of ['/mcp', '/mcp/uploads/event-media', '/mcp/uploads/organization-media']) {
    const response=await worker.fetch(new Request('https://orgportal.cc'+path,{method:'POST',body:'fixture',headers:{'x-forwarded-host':'evil.test'}}),{ORG_API_ORIGIN:'https://api.example'});
    assert.equal(response.status,401);
  }
});

test('OAuth discovery, keys, and browser flow stay on the OrgPortal origin', async () => {
  const paths=['/.well-known/oauth-authorization-server','/.well-known/jwks.json','/oauth/mcp/register','/oauth/mcp/authorize','/oauth/mcp/browser','/oauth/mcp/browser/status','/oauth/mcp/browser/finish','/oauth/mcp/introspect','/oauth/mcp/token'];
  for(const path of paths) {
    const response=await worker.fetch(new Request('https://orgportal.cc'+path+'?fixture=1',{headers:{'x-forwarded-host':'evil.test'}}),{PIDP:{fetch:async(url,init)=>{
      assert.equal(url,'https://orgportal.cc'+path+'?fixture=1');
      assert.equal(init.headers.get('x-forwarded-host'),null);
      return Response.json({ok:true});
    }}});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
});

test('OrgPortal retires the old platform MCP address', async () => {
  for(const path of ['/api/org/mcp','/api/org/mcp/uploads/event-media','/.well-known/oauth-protected-resource/api/org/mcp']) {
    assert.equal((await worker.fetch(new Request('https://orgportal.cc'+path),{})).status,404);
  }
});
