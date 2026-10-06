import test from 'node:test'
import assert from 'node:assert/strict'
import { webReleaseManifest } from '../../scripts/write-web-update-manifest.mjs'

test('web releases advertise the compiled build without changing Android releases', () => {
  const source = { version: 1, android: { buildNumber: 8, apkUrl: 'https://example.org/app.apk', minSupportedBuildNumber: 5 }, web: { buildNumber: 1 } }
  const result = webReleaseManifest(source, 123456789, '2.0.0', 'New calendar tools')
  assert.deepEqual(result.android, source.android)
  assert.equal(source.web.buildNumber, 1)
  assert.equal(result.web.buildNumber, 123456789)
  assert.equal(result.web.versionName, '2.0.0')
  assert.equal(result.web.notes, 'New calendar tools')
  assert.ok(!Number.isNaN(Date.parse(result.publishedAt)))
  for (const invalid of [0, -1, NaN, 1.5]) assert.throws(() => webReleaseManifest(source, invalid, '2.0.0'))
})
