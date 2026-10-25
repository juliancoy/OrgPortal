import test from 'node:test';
import assert from 'node:assert/strict';
import { posterLinkTarget, renderEventPoster, posterLogo, posterGeometry } from '../src/eventPoster';

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
  const svg = await renderEventPoster({ title: 'Night builders', starts_at: '2026-09-29T22:00:00Z' }, 'https://example.org/event', 'letter', { name: 'Community' }, 'dark',{background:'solid'});
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

test('LifeTech plain background exports preserve artwork and contain no event text or QR code', async () => {
  for (const format of ['letter', 'letter-4up', 'postcard', 'social'] as const) {
    const svg = await renderEventPoster({title:'Private event copy'}, 'https://example.org/event', format, {name:'LifeTech'}, 'light', {
      background:'lifetech', backgroundImage:'data:image/png;base64,AQID', backgroundOnly:true,
    });
    const {width,height}=posterGeometry(format);
    assert.ok(svg.includes(`viewBox="0 0 ${width} ${height}"`));
    assert.match(svg, /preserveAspectRatio="xMidYMax meet"/);
    assert.match(svg, /data:image\/png;base64,AQID/);
    assert.doesNotMatch(svg, /<text|Private event copy|Scan to RSVP|<path/);
    if(format==='letter-4up')assert.equal(svg.match(/<use href="#background-art"/g)?.length,4);
  }
  const poster=await renderEventPoster({title:'LifeTech Social'},'https://example.org/event','letter',{name:'LifeTech'},'light',{background:'lifetech',backgroundImage:'data:image/png;base64,AQID'});
  assert.match(poster, /LifeTech Social/);
  assert.match(poster, /opacity="0.66"/);
  assert.match(poster, /Scan to RSVP/);
});

test('LifeTech artwork spans the full canvas in every format, with a separate header logo', async () => {
  for (const format of ['letter', 'letter-4up', 'postcard', 'social'] as const) {
    const svg = await renderEventPoster({ title: 'Life Tech Social [#2]' }, 'https://lifetech.fyi/events/life-tech-social-2', format,
      { name: 'LifeTech', logo: 'data:image/png;base64,BAUG' }, 'dark',
      { background: 'lifetech', backgroundImage: 'data:image/png;base64,AQID' });
    const artwork = svg.match(/<image href="data:image\/png;base64,AQID"[^>]*width="(\d+)"/);
    const qr = svg.match(/<svg x="(\d+)" y="(\d+)" width="(\d+)"/);
    assert.ok(artwork && qr);
    assert.equal(Number(artwork[1]), posterGeometry(format).width, `${format}: artwork fills the canvas behind all elements`);
    assert.match(svg, /<image href="data:image\/png;base64,BAUG"/);
  }
});

test('crop is bounded, clipped and shared by poster and plain-background exports', async () => {
  for (const format of ['letter', 'letter-4up', 'postcard', 'social'] as const) {
    const {width,height}=posterGeometry(format);
    for (const backgroundOnly of [false,true]) {
      const svg=await renderEventPoster({title:'Crop test'},'https://example.com',format,{name:'Test'},'light',{background:'gallery',backgroundImage:'data:image/png;base64,AQID',zoom:2,offsetX:50,offsetY:-50,backgroundOnly});
      assert.ok(svg.includes(`x="${-width/4}" y="${-height*3/4}" width="${width*2}" height="${height*2}"`));
      assert.ok(svg.includes(`width="${width}" height="${height}" overflow="hidden"`));
    }
  }
  const svg=await renderEventPoster({title:'Limits'},'https://example.com','postcard',{name:'Test'},'light',{background:'gallery',backgroundImage:'data:image/png;base64,AQID',zoom:Infinity,offsetX:1000,offsetY:NaN});
  assert.ok(svg.includes('x="200" y="0" width="400" height="600"'));
  assert.ok(!svg.includes('NaN') && !svg.includes('Infinity'));
});

test('elements independently resize, move and hide in every format without reflowing others', async () => {
  const event={title:'Editable title',starts_at:'2026-10-20T22:00:00Z',location:'City Garage'};
  for (const format of ['letter','letter-4up','postcard','social'] as const) {
    const base=await renderEventPoster(event,'https://example.com',format,{name:'Example'});
    const svg=await renderEventPoster(event,'https://example.com',format,{name:'Example'},'light',{elements:{time:{hidden:true},title:{scale:1.5,x:10,y:-5},qr:{hidden:true}}});
    assert.ok(!svg.includes('data-poster-element="time"'));
    assert.ok(!svg.includes('data-poster-element="qr"'));
    assert.ok(!svg.includes('Scan to RSVP'));
    const {width,height}=posterGeometry(format);
    assert.ok(svg.includes(`data-poster-element="title" transform="translate(${width/10} ${-height/20})`));
    assert.ok(svg.includes('scale(1.5)'));
    const date=(value:string)=>value.match(/<g data-poster-element="date"[^]*?<\/g>/)?.[0];
    assert.equal(date(svg),date(base));
  }
});

test('image opacity defaults and clamps without fading foreground text', async () => {
  for (const format of ['letter', 'letter-4up', 'postcard', 'social'] as const) {
    for (const [opacity, expected] of [[undefined, 1], [NaN, 1], [-1, 0], [2, 1], [.35, .35]] as const) {
      const svg = await renderEventPoster({ title: 'Visible title' }, 'https://example.com', format, { name: 'Test' }, 'light', { background: 'gallery', backgroundImage: 'data:image/png;base64,AQID', opacity });
      assert.match(svg, new RegExp(`data-poster-background="true"[^>]+opacity="${expected}"`));
      assert.match(svg, /Visible title/);
      assert.doesNotMatch(svg, /<g[^>]+opacity=/);
    }
  }
});


test('poster links only select safe URLs already associated with the event', () => {
  const portal = 'https://example.org/events/test', luma = 'https://luma.com/example';
  assert.equal(posterLinkTarget(portal, luma, [luma]), luma);
  for (const value of ['portal', null, 'https://unrelated.example', 'javascript:alert(1)', 'https://user:password@example.com']) {
    assert.equal(posterLinkTarget(portal, value, [luma, 'javascript:alert(1)', 'https://user:password@example.com']), portal);
  }
});

test('zero dimming removes all fixed photo darkening', async () => {
 for (const background of ['city','gallery','lifetech'] as const) {
  const svg=await renderEventPoster({title:'Bright image'},'https://example.org','social',{name:'Test'},'light',{background,backgroundImage:'data:image/png;base64,AQID',dimming:0});
  assert.match(svg,/data-poster-dimming="true" opacity="0"/);
  assert.doesNotMatch(svg,/opacity="0\.66"|opacity="0\.26"/);
 }
});

test('native chat poster destinations stay on the portal and preserve its mount path', async () => {
  const portal = 'https://example.org/portals/lifetech/events/test';
  assert.equal(posterLinkTarget(portal,'event-chat',[]), `${portal}#discussion`);
  assert.equal(posterLinkTarget(portal,'group-chat',[],'lifetech'), 'https://example.org/portals/lifetech/chat?start=org&org=lifetech');
  assert.equal(posterLinkTarget(portal,'group-chat',[]),portal);
  const injected = new URL(posterLinkTarget(portal,'group-chat',[],'lifetech&user=other'));
  assert.equal(injected.searchParams.get('org'),'lifetech&user=other');
  assert.equal(injected.searchParams.get('user'),null);
  assert.equal(posterLinkTarget(portal,'https://chat.whatsapp.com/TestGroup123',[]),portal);
  for(const format of ['letter','letter-4up','postcard','social'] as const) {
    const svg = await renderEventPoster({ title: 'Community' }, `${portal}#discussion`, format, { name: 'Community' }, 'light', {chatLink:true});
    assert.match(svg, /Scan to join chat/);
    assert.doesNotMatch(svg, /Scan to RSVP|WhatsApp/);
  }
});

test('default posters are designed and omit descriptions; descriptions remain available on request',async()=>{
 for(const format of ['letter','postcard','social','letter-4up'] as const){
  const event={title:'Community research night',description:'OPTIONAL_DETAIL_TEXT',starts_at:'2026-11-17T23:00:00Z'};
  const svg=await renderEventPoster(event,'https://example.org/event',format,{name:'Research collective'});
  assert.match(svg,/poster-bg-gradient/);assert.doesNotMatch(svg,/OPTIONAL_DETAIL_TEXT|data-poster-element="description"/);
  const details=await renderEventPoster(event,'https://example.org/event',format,{name:'Research collective'},'light',{elements:{description:{hidden:false}}});
  assert.match(details,/OPTIONAL_DETAIL_TEXT/);
 }
});
