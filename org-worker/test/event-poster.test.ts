import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEventPoster, posterLogo, posterGeometry } from '../src/eventPoster';

test('posters escape text, carry the real host, use explicit print sizes and avoid remote image dependencies', async () => {
  for (const format of ['letter', 'letter-4up', 'postcard', 'social'] as const) {
    const svg = await renderEventPoster({ title: 'Builders <script>alert(1)</script>', starts_at: '2026-09-29T22:00:00Z', ends_at: '2026-09-30T00:30:00Z', location: 'Checkerspot & Palava Hut', description: 'A community event.' }, 'https://example.org/events/builders', format, { name: 'Builders Guild', tagline: 'Build together' });
    assert.ok(svg.includes('Builders Guild'));
    assert.ok(svg.includes('6:00 PM EDT'));
    assert.ok(svg.includes('8:30 PM EDT'));
    assert.ok(svg.includes('Scan to RSVP'));
    assert.ok(!svg.includes('<script>'));
    assert.ok(!svg.includes('MedTech'));
    assert.ok(!svg.includes('<image'));
    const { width, height } = posterGeometry(format);
    assert.ok(svg.includes(`viewBox="0 0 ${width} ${height}"`));
    if (format === 'letter' || format === 'letter-4up') assert.ok(svg.includes('width="8.5in" height="11in"'));
    if (format === 'letter-4up') assert.equal(svg.match(/<use href="#poster-art"/g)?.length, 4);
    if (format === 'postcard') assert.ok(svg.includes('width="4in" height="6in"'));
  }
});

test('missing dates and malformed optional dates do not crash generation', async () => {
  const svg = await renderEventPoster({ title: 'A future event', starts_at: 'invalid', ends_at: 'invalid' }, 'https://example.org/event', 'postcard', { name: 'Community' });
  assert.match(svg, /Date to be announced/);
  assert.match(svg, /Location to be announced/);
});

test('brand image loading rejects redirects, SVG and oversized images', async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [new Response(null, { status: 302 }), new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }), new Response(new Uint8Array(512001), { headers: { 'content-type': 'image/png' } })]) {
      globalThis.fetch = async (_url, options) => { assert.equal(options?.redirect, 'manual'); return response; };
      assert.equal(await posterLogo(new URL('https://example.org/images/logo.png')), undefined);
    }
    globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
    assert.equal(await posterLogo(new URL('https://example.org/images/logo.png')), 'data:image/png;base64,AQID');
  } finally { globalThis.fetch = original; }
});
