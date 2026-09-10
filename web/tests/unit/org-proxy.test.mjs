import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../../cloudflare/worker.js'

test('org proxy preserves OAuth cookies and forwards campaign request bodies', async (t) => {
  const seen = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    seen.push({ url, options })
    return new Response('{}', { headers: { 'Set-Cookie': '__Host-portal-email-oauth=state; Path=/; Secure; HttpOnly; SameSite=Lax', 'Cache-Control': 'no-store' } })
  })
  const response = await worker.fetch(new Request('https://portal.test/api/org/api/email/google/connect', {
    method: 'POST', headers: { Authorization: 'Bearer test' }, body: '{}',
  }), { ORG_API_ORIGIN: 'https://org.test' })
  assert.equal(seen[0].url, 'https://org.test/api/email/google/connect')
  assert.equal(seen[0].options.headers.get('Authorization'), 'Bearer test')
  assert.equal(seen[0].options.redirect, 'manual')
  assert.match(response.headers.get('Set-Cookie'), /Secure; HttpOnly; SameSite=Lax/)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
})

test('org proxy CORS only allows same-origin or configured origins', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    return new Response('{}', { headers: { 'Cache-Control': 'no-store' } })
  })
  const env = { ORG_API_ORIGIN: 'https://org.test', PORTAL_ALLOWED_ORIGINS: 'https://admin.example' }

  const sameOriginPreflight = await worker.fetch(new Request('https://medtech.social/api/org/api/network/contact/me', {
    method: 'OPTIONS',
    headers: { Origin: 'https://medtech.social' },
  }), env)
  assert.equal(sameOriginPreflight.status, 204)
  assert.equal(sameOriginPreflight.headers.get('access-control-allow-origin'), 'https://medtech.social')

  const allowedResponse = await worker.fetch(new Request('https://medtech.social/api/org/api/network/contact/me', {
    headers: { Origin: 'https://admin.example' },
  }), env)
  assert.equal(allowedResponse.status, 200)
  assert.equal(allowedResponse.headers.get('access-control-allow-origin'), 'https://admin.example')

  const deniedPreflight = await worker.fetch(new Request('https://medtech.social/api/org/api/network/contact/me', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example' },
  }), env)
  assert.equal(deniedPreflight.status, 403)
  assert.equal(deniedPreflight.headers.get('access-control-allow-origin'), null)
})
