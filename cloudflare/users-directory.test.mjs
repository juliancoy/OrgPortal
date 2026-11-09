import test from 'node:test'
import assert from 'node:assert/strict'
import worker from './worker.js'
import {isPortalPagePath} from '../web/portalRoutes.mjs'

test('users and people collection URLs serve the directory shell for GET and HEAD', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(String(url), 'https://org.example/api/portal/site')
    return Response.json({id: 'lifetech', name: 'LifeTech'})
  })
  for (const host of ['lifetech.fyi', 'orgportal.cc']) for (const path of ['/users', '/users/', '/people', '/people/']) {
    assert.equal(isPortalPagePath(path), true)
    for (const method of ['GET', 'HEAD']) {
      const response = await worker.fetch(new Request(`https://${host}${path}?org=fixture`, {method, headers: {accept: 'text/html'}}), {
        ORGPORTAL_SITE_HOSTS: 'lifetech.fyi,orgportal.cc', ORG_API_ORIGIN: 'https://org.example',
        ASSETS: {fetch: async request => {
          assert.equal(new URL(request.url).pathname, '/__portal_root/index.html')
          assert.equal(request.method, method)
          return new Response(method === 'HEAD' ? null : '<html><head></head><body>Directory</body></html>', {headers: {'content-type':'text/html'}})
        }},
      })
      assert.equal(response.status, 200, host + path + method)
      assert.equal(response.headers.get('location'), null)
      assert.match(response.headers.get('cache-control'), /no-store/)
    }
  }
  assert.equal(isPortalPagePath('/users/missing/nested'), false)
  assert.equal(isPortalPagePath('/users/example-person'), true)
  assert.equal(isPortalPagePath('/users/login'), true)
})
