import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

test('OrgPortal Timebank routes require a community choice and preserve link context', async () => {
  for (const path of ['/timebanking', '/timebanking/']) {
    const response = await worker.fetch(new Request(`https://orgportal.cc${path}?listing=existing`), {});
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), 'https://orgportal.cc/communities?listing=existing&feature=timebank');
  }
});

test('OrgPortal install assets use the neutral bundle', async () => {
  const env = { ORGPORTAL_SITE_HOSTS: 'orgportal.cc', ASSETS: { fetch: async request => new Response(new URL(request.url).pathname) } };
  for (const path of ['/orgportal.svg', '/orgportal.webmanifest', '/fonts/CLT-Mattone/web/Mattone-Black.woff2']) {
    const response = await worker.fetch(new Request('https://orgportal.cc' + path), env);
    assert.equal(await response.text(), '/__portal_root' + path);
  }
  const favicon = await worker.fetch(new Request('https://orgportal.cc/favicon.ico'), env);
  assert.equal(favicon.headers.get('location'), 'https://orgportal.cc/orgportal.svg');
});

test('OAuth discovery routes reach the API for root and resource-specific metadata', async t => {
  const paths = [];
  t.mock.method(globalThis, 'fetch', async request => {
    paths.push(new URL(typeof request === 'string' ? request : request.url).pathname);
    return Response.json({resource:'https://orgportal.cc/mcp'});
  });
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    const response = await worker.fetch(new Request('https://orgportal.cc' + path), { ORG_API_ORIGIN: 'https://api.example.com' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).resource, 'https://orgportal.cc/mcp');
  }
  assert.deepEqual(paths, ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']);
});
