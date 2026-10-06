import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPortalPagePath, notFoundResponse } from '../../portalRoutes.mjs';
test('every registered portal route is recognized, with complete path matching', () => {
  const router = readFileSync(new URL('../../src/ui/router/createAppRouter.tsx', import.meta.url), 'utf8');
  for (const [, path] of router.matchAll(/path:\s*'([^']+)'/g)) {
    if (path !== '*') assert.equal(isPortalPagePath(path.replace(/:[^/]+/g, 'example')), true, path);
  }
  for (const path of ['/missing-page', '/email/missing-page', '/events/example/missing-page', '/settings/missing-page', '/assets/missing.js', '/%ZZ']) assert.equal(isPortalPagePath(path), false, path);
});
test('missing pages return HTTP 404, noindex, and an empty HEAD body', async () => {
  const get = notFoundResponse(new Request('https://example.org/missing'));
  assert.equal(get.status, 404);
  assert.match(await get.text(), /404 — Page not found/);
  assert.equal(get.headers.get('x-robots-tag'), 'noindex');
  assert.equal(await notFoundResponse(new Request('https://example.org/missing', { method: 'HEAD' })).text(), '');
});
