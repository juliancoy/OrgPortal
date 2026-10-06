import test from 'node:test'
import assert from 'node:assert/strict'
import { applySeo } from '../../seo.mjs'

test('tenant social cards escape values, replace duplicate tags, and retain structured event data', () => {
  const original = '<head><title>Old</title><meta property="og:image" content="old"><meta name="twitter:card" content="summary"><script type="application/ld+json">{"@type":"Event"}</script></head>'
  const result = applySeo(original, {
    title: 'LifeTech & "care"', description: '<care>', canonicalUrl: 'https://lifetech.fyi/',
    imageUrl: 'https://lifetech.fyi/preview.png', imageWidth: 1733, imageHeight: 908, imageAlt: 'Health & medicine',
  })
  assert.match(result, /LifeTech &amp; &quot;care&quot;/)
  assert.match(result, /content="&lt;care&gt;"/)
  assert.equal(result.match(/property="og:image"/g).length, 1)
  assert.equal(result.match(/name="twitter:card"/g).length, 1)
  assert.match(result, /summary_large_image/)
  assert.match(result, /og:image:width" content="1733"/)
  assert.match(result, /"@type":"Event"/)
  const replaced = applySeo(original, {title: 'New', description: 'New', canonicalUrl: 'https://example.org', jsonLd: [{ '@type': 'WebPage', text: '</script>' }]})
  assert.doesNotMatch(replaced, /"@type":"Event"/)
  assert.match(replaced, /<\\\/script>/)
})
