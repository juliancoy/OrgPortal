import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';
test('release health reports the frontend artifact commit and runtime version', async () => {
  const response = await worker.fetch(new Request('https://orgportal.cc/health'), {
    CF_VERSION_METADATA: { id: 'deployed-version' },
    ASSETS: { fetch: async () => Response.json({ commit: 'exact-commit', dirty: false, builtAt: '2026-10-13' }) },
  });
  const result = await response.json();
  assert.equal(result.service, 'orgportal-web');
  assert.equal(result.commit, 'exact-commit');
  assert.equal(result.workerVersionId, 'deployed-version');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('workers.dev uses the platform tenant and ignores spoofed forwarding headers', async t => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://org.example/api/portal/site');
    assert.equal(init.headers['x-forwarded-host'], 'orgportal.cc');
    return Response.json({ id: 'orgportal' });
  });
  const result = await worker.fetch(new Request('https://orgportal-web.jcloiacon.workers.dev/', {
    headers: { 'x-forwarded-host': 'attacker.example' },
  }), { ORG_API_ORIGIN: 'https://org.example', ORGPORTAL_SITE_HOSTS: 'orgportal.cc', ASSETS: { fetch: async () => new Response('platform') } });
  assert.equal(await result.text(), 'platform');
});
