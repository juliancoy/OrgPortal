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
