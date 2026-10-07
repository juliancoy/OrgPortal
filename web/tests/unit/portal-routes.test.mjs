import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPortalPagePath, notFoundResponse, missingPortalResource } from '../../portalRoutes.mjs';
test('every registered portal route is recognized, with complete path matching', () => {
  const router = readFileSync(new URL('../../src/ui/router/createAppRouter.tsx', import.meta.url), 'utf8');
  for (const [, path] of router.matchAll(/path:\s*'([^']+)'/g)) {
    if (path !== '*') assert.equal(isPortalPagePath(path.replace(/:[^/]+/g, 'example')), true, path);
  }
  for (const path of ['/missing-page', '/email/missing-page', '/events/example/missing-page', '/settings/missing-page', '/assets/missing.js', '/%ZZ']) assert.equal(isPortalPagePath(path), false, path);
});
test('missing public resources return 404 while API failures remain 503', async t => {
  for (const status of [200,404,503]) {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, 'https://org.example/api/network/events/public/example');
      assert.equal(options.headers['x-forwarded-host'], 'lifetech.fyi');
      return new Response('{}', {status});
    });
    const response = await missingPortalResource(new Request('https://lifetech.fyi/events/example'), '/events/example', 'https://org.example');
    assert.equal(response?.status ?? null, status === 200 ? null : status);
    t.mock.restoreAll();
  }
  assert.equal(await missingPortalResource(new Request('https://lifetech.fyi/users/login'), '/users/login', 'https://org.example'), null);
});
test('missing pages return HTTP 404, noindex, and an empty HEAD body', async () => {
  const get = notFoundResponse(new Request('https://example.org/missing'));
  assert.equal(get.status, 404);
  assert.match(await get.text(), /404 — Page not found/);
  assert.equal(get.headers.get('x-robots-tag'), 'noindex');
  assert.equal(await notFoundResponse(new Request('https://example.org/missing', { method: 'HEAD' })).text(), '');
});

test('network evidence views support direct navigation', () => {
  for (const view of ['events', 'relationships', 'help']) {
    assert.equal(isPortalPagePath(`/ecosystem/network/${view}`), true);
    assert.equal(isPortalPagePath(`/ecosystem/network/${view}/missing`), false);
  }
});
