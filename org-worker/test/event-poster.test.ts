import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEventPoster, posterLogo, posterGeometry } from '../src/eventPoster';

function luminance([r, g, b]: [number, number, number]) {
  const linear = [r, g, b].map(value => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: [number, number, number], b: [number, number, number]) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexRgb(value: string): [number, number, number] {
  const hex = value.replace('#', '');
  return [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

function blend(top: [number, number, number], bottom: [number, number, number], opacity: number): [number, number, number] {
  return top.map((value, index) => Math.round(value * opacity + bottom[index] * (1 - opacity))) as [number, number, number];
}

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

test('dark poster theme uses dark paper while retaining a white QR background', async () => {
  const svg = await renderEventPoster({ title: 'Night builders', starts_at: '2026-09-29T22:00:00Z' }, 'https://example.org/event', 'letter', { name: 'Community' }, 'dark');
  assert.match(svg, /fill="#101820"/);
  assert.match(svg, /fill="#f7fbfc"/);
  assert.match(svg, /fill="#33c6d4"/);
  assert.match(svg, /fill="#ffffff"/);
  assert.match(svg, /dark solid 8\.5×11 event poster/);
});

test('photo and gradient poster backgrounds retain accessible text contrast', async () => {
  const event = { title: 'City builders', starts_at: '2026-09-29T22:00:00Z', location: 'Baltimore' };
  const city = await renderEventPoster(event, 'https://example.org/event', 'letter', { name: 'Community' }, 'light', {
    background: 'city',
    backgroundImage: 'data:image/jpeg;base64,AQID',
  });
  assert.match(city, /href="data:image\/jpeg;base64,AQID"/);
  assert.match(city, /opacity="0\.66"/);
  assert.match(city, /fill="#ffffff"/);
  assert.match(city, /high-contrast foreground/);

  const gradient = await renderEventPoster(event, 'https://example.org/event', 'letter', { name: 'Community' }, 'light', { background: 'gradient' });
  assert.match(gradient, /poster-bg-gradient/);
  assert.match(gradient, /fill="#ffffff"/);
  assert.match(gradient, /gradient 8\.5×11 event poster/);

  const worstCityBackground = blend(hexRgb('#061a26'), blend([0, 0, 0], [255, 255, 255], 0.66), 0.26);
  const brightestGradientBackground = blend([0, 0, 0], hexRgb('#087482'), 0.2);
  for (const foreground of ['#ffffff', '#d7e3e6', '#a8f7ff'] as const) {
    assert.ok(contrast(hexRgb(foreground), worstCityBackground) >= 4.5, `${foreground} must contrast with the city overlay`);
    assert.ok(contrast(hexRgb(foreground), brightestGradientBackground) >= 4.5, `${foreground} must contrast with the gradient`);
  }
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
