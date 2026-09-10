import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../../cloudflare/worker.js'

function assetEnv() {
  return {
    ORG_API_ORIGIN: 'https://org.test',
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/index.html') {
          return new Response(`<!doctype html>
<html>
  <head>
    <title>Code Collective Portal</title>
  </head>
  <body><div id="root"></div></body>
</html>`, { headers: { 'content-type': 'text/html' } })
        }
        return new Response('missing', { status: 404 })
      },
    },
  }
}

test('tenant event pages expose uploaded images in initial social preview HTML', async (t) => {
  const seen = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    seen.push({ url, options })
    return Response.json({
      title: 'MedTech in the Hut',
      slug: 'medtech-in-the-hut',
      description: 'A formation night for Baltimore medtech builders.',
      image_url: 'https://images.example/medtech-hut.jpg',
      public_url: 'https://medtech.social/events/medtech-in-the-hut',
    })
  })

  const response = await worker.fetch(new Request('https://medtech.social/events/medtech-in-the-hut', {
    headers: { accept: 'text/html' },
  }), assetEnv())
  const html = await response.text()

  assert.equal(response.status, 200)
  assert.equal(seen[0].url, 'https://org.test/api/network/events/public/medtech-in-the-hut')
  assert.equal(seen[0].options.headers.get('x-forwarded-host'), 'medtech.social')
  assert.match(html, /<title>MedTech in the Hut \| OrgPortal<\/title>/)
  assert.match(html, /<meta property="og:image" content="https:\/\/images\.example\/medtech-hut\.jpg" \/>/)
  assert.match(html, /<meta name="twitter:image" content="https:\/\/images\.example\/medtech-hut\.jpg" \/>/)
  assert.match(html, /<meta property="og:url" content="https:\/\/medtech\.social\/events\/medtech-in-the-hut" \/>/)
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/)
})

test('codecollective /p event pages keep /p canonical previews', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    title: 'Portal Town Hall',
    slug: 'portal-town-hall',
    description: 'Updates for the shared portal.',
    image_url: 'https://images.example/town-hall.png',
    public_url: 'https://codecollective.us/p/events/portal-town-hall',
  }))

  const response = await worker.fetch(new Request('https://codecollective.us/p/events/portal-town-hall', {
    headers: { accept: 'text/html' },
  }), assetEnv())
  const html = await response.text()

  assert.equal(response.status, 200)
  assert.match(html, /<meta property="og:image" content="https:\/\/images\.example\/town-hall\.png" \/>/)
  assert.match(html, /<meta property="og:url" content="https:\/\/codecollective\.us\/p\/events\/portal-town-hall" \/>/)
})

