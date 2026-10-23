import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';
test('test status reports use the portal asset mount and are never cached', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = await worker.fetch(new Request('https://orgportal.cc/test-status.json?refresh=1', {method}), {
      ORGPORTAL_SITE_HOSTS: 'orgportal.cc',
      ASSETS: {fetch: async request => {
        assert.equal(new URL(request.url).pathname, '/__portal_root/test-status.json');
        assert.equal(request.method, method);
        return new Response(method === 'HEAD' ? null : '{"version":1}', {headers:{'content-type':'application/json'}});
      }},
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), method === 'HEAD' ? '' : '{"version":1}');
  }
});
test('unknown portal pages return 404 in production and private previews', async () => {
  const assets = { fetch: async () => new Response('Missing asset', { status: 404 }) };
  for (const [host,path,preview] of [
    ['codecollective.us','/p/not-a-route',false],
    ['codecollective.us','/p/email/not-a-route',false],
    ['timebank.codecollective.us','/not-a-route',false],
    ['codecollective.us','/p/not-a-route',true],
    ['lifetech.fyi','/not-a-route',true],
  ]) {
    const request = new Request(`https://${host}${path}`, { headers: { accept: 'text/html', ...(preview ? {'x-preview-mount': host === 'codecollective.us' ? 'portal' : 'lifetech'} : {}) } });
    const response = await worker.fetch(request,{ ASSETS:assets, WEB_PREVIEW:preview ? 'true' : 'false' });
    assert.equal(response.status,404,`${host}${path}`);
    assert.match(await response.text(),/404 — Page not found/);
    assert.equal(response.headers.get('x-robots-tag'),'noindex');
  }
});


test('removed /p mount returns 404 without accessing assets or APIs', async () => {
  const unavailable = () => { throw new Error('Removed mount must not fetch'); };
  for (const host of ['codecollective.us', 'orgportal.cc', 'lifetech.fyi']) {
    for (const path of ['/p', '/p/', '/p/chat', '/p/assets/index.js', '/p/mobile-update.json', '/p/auth/callback']) {
      for (const preview of [false, true]) {
        const response = await worker.fetch(new Request(`https://${host}${path}`, { headers: { 'x-preview-mount': 'root' } }), {
          WEB_PREVIEW: preview ? 'true' : 'false', ASSETS: { fetch: unavailable }, DEV_ASSETS: { fetch: unavailable },
        });
        assert.equal(response.status, 404, `${host}${path}`);
        assert.equal(response.headers.get('location'), null);
      }
    }
  }
});
