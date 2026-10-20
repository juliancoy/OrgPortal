// Local, unauthenticated fixture test: no production event writes or login.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { posterLinkTarget, renderEventPoster } from '../../org-worker/src/eventPoster.ts';
const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {EventPosterTools} from './src/ui/components/EventPosterTools'; import * as state from './src/ui/components/posterEditorState'; window.posterState=state; createRoot(document.getElementById('root')).render(<EventPosterTools inline sourceUrl="https://luma.com/example" slug="fixture" title="Fixture"/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outdir: '/tmp/poster-editor-test', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
let requests = 0;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.endsWith('poster-images')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify([{ id: 'photo', label: 'Fixture photo', source: 'Host', url: '/pixel.png' }])); return; }
  if (url.pathname.endsWith('flyer.svg')) {
    requests++;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.end(await renderEventPoster({ title: 'Fixture', starts_at: '2026-10-20T22:00:00Z' }, posterLinkTarget('https://example.org/event', url.searchParams.get('link'), ['https://luma.com/example']), url.searchParams.get('format'), { name: 'Test' }, 'light', { background: url.searchParams.get('background'), backgroundImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' })); return;
  }
  if (url.pathname === '/test.js' || url.pathname === '/test.css') { const file = bundle.outputFiles.find(f => f.path.endsWith(url.pathname.endsWith('js') ? '.js' : '.css')); res.setHeader('Content-Type', url.pathname.endsWith('js') ? 'text/javascript' : 'text/css'); res.end(file?.text || ''); return; }
  res.setHeader('Content-Type', 'text/html'); res.end('<link rel="stylesheet" href="/test.css"><div id="root"></div><script src="/test.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_BINARY ? { executablePath: process.env.BROWSER_BINARY, args: ['--no-sandbox'] } : {}) });
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  const svg = page.locator('.event-poster-preview svg').first();
  await svg.waitFor();
  const canvasBox = await page.locator('.event-poster-preview').boundingBox();
  const settingsBox = await page.locator('.event-poster-settings').boundingBox();
  assert.ok(canvasBox.x + canvasBox.width <= settingsBox.x, 'poster appears left of settings');
  await page.getByLabel('Background', { exact: true }).selectOption('gallery');
  await page.getByRole('button', { name: 'Fixture photo Host' }).click();
  await page.locator('[data-poster-background]').waitFor();
  const before = requests;
  await page.getByLabel('Element', { exact: true }).selectOption('background');
  await page.getByLabel('Blur image into empty edges').check();
  await page.getByLabel('Zoom:').fill('0.5');
  await page.getByRole('button', { name: 'Select background on canvas' }).click();
  const handle = page.locator('[data-resize="1,1"]');
  await page.locator('.event-poster-preview').scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const bounds = await handle.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 20, bounds.y + bounds.height / 2 + 20); await page.mouse.up();
  assert.ok(Number(await page.getByLabel('Zoom:').inputValue()) > .5, 'canvas corner resizes the background');
  await expect(page.locator('[data-poster-edge-fill] image')).toHaveAttribute('preserveAspectRatio', 'xMidYMid slice');
  const previewBox = await page.locator('.event-poster-preview').boundingBox();
  await page.mouse.move(previewBox.x + 8, previewBox.y + previewBox.height / 2);
  await page.mouse.down(); await page.mouse.move(previewBox.x + 28, previewBox.y + previewBox.height / 2); await page.mouse.up();
  assert.ok(Number(await page.getByLabel('Horizontal position:').first().inputValue()) > 0, 'canvas drag moves the background');
  await page.getByLabel('Opacity:').fill('0.35');
  await page.getByLabel('Zoom:').fill('2');
  await page.getByLabel('Background dimming:').fill('0');
  await page.locator('[data-poster-element="title"]').click();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Element"]')?.value === 'title');
  await expect(page.getByLabel('Size:')).toBeVisible();
  await page.getByLabel('Drop shadow', { exact: true }).check();
  await expect(page.locator('[data-poster-element="title"]')).toHaveAttribute('filter', 'url(#poster-element-shadow)');
  await expect(page.getByLabel('Zoom:')).toHaveCount(0);
  await page.getByRole('heading', { name: 'Event poster', exact: true }).click();
  await expect(page.getByLabel('Element', { exact: true })).toHaveValue('');
  await expect(page.locator('[data-editor-ui]')).toHaveCount(0);
  await expect(page.getByLabel('Size:')).toHaveCount(0);
  await page.getByLabel('Element', { exact: true }).selectOption('time');
  await page.getByLabel('Show time').uncheck();
  await page.waitForFunction(() => document.querySelector('.event-poster-preview > div')?.shadowRoot?.querySelector('[data-poster-background]')?.getAttribute('opacity') === '0.35');
  await expect(page.locator('[data-poster-dimming]')).toHaveAttribute('opacity', '0');
  assert.equal(requests, before, 'sliders must not request new SVGs');
  await expect(page.locator('[data-poster-element="time"]')).toHaveAttribute('display', 'none');
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'SVG', exact: true }).click();
  const download = await downloadPromise; const stream = await download.createReadStream(); let exported = ''; for await (const chunk of stream) exported += chunk;
  await page.evaluate(async source => {
    const image = new Image(), url = URL.createObjectURL(new Blob([source], {type:'image/svg+xml'}));
    try { image.src = url; await image.decode(); } finally { URL.revokeObjectURL(url); }
  }, exported);
  assert.match(exported, /feDropShadow/);
  assert.match(exported, /filter="url\(#poster-element-shadow\)"/);
  assert.match(exported, /feGaussianBlur/); assert.doesNotMatch(exported, /data-editor-ui|data-resize/);
  assert.match(exported, /opacity="0.35"/); assert.match(exported, /display="none"/);
  await page.reload(); await page.locator('[data-poster-background]').waitFor();
  await page.getByLabel('Element', { exact: true }).selectOption('title');
  await expect(page.getByLabel('Drop shadow', { exact: true })).toBeChecked();
  await page.getByLabel('Drop shadow', { exact: true }).uncheck();
  await expect(page.locator('[data-poster-element="title"]')).not.toHaveAttribute('filter');
  await page.getByLabel('Element', { exact: true }).selectOption('background');
  await expect(page.getByLabel('Blur image into empty edges')).toBeChecked();
  assert.equal(await page.getByLabel('Opacity:').inputValue(), '0.35'); assert.equal(await page.getByLabel('Zoom:').inputValue(), '2');
  for (const name of ['8.5 x 11', 'Letter 2 × 2', '4 x 6', 'Social']) {
    await page.getByRole('button', { name, exact: true }).click(); await svg.waitFor();
    await page.waitForFunction(() => document.querySelector('.event-poster-preview > div')?.shadowRoot?.querySelector('[data-poster-background]')?.getAttribute('opacity') === '0.35');
    if (name === 'Letter 2 × 2') {
      await page.locator('.event-poster-preview').scrollIntoViewIfNeeded();
      const point = await page.evaluate(() => {
        const root = document.querySelector('.event-poster-preview > div').shadowRoot;
        const title = root.querySelector('[data-poster-element="title"]'), box = title.getBBox();
        const point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(title.transform.baseVal.consolidate().matrix).matrixTransform(root.querySelector('use').getScreenCTM());
        return { x: point.x, y: point.y };
      });
      await page.mouse.click(point.x, point.y);
      await expect(page.getByLabel('Element', { exact: true })).toHaveValue('title');
    }
    const qr = page.locator('[data-poster-element="qr"] svg'); assert.ok(Number(await qr.getAttribute('width')) < 200);
  }
  await page.getByLabel('Poster link', { exact: true }).selectOption('https://luma.com/example');
  await svg.waitFor();
  await expect(page.locator('[data-poster-element="website"]')).toHaveText('luma.com');
  await page.reload(); await svg.waitFor();
  assert.equal(await page.getByLabel('Poster link', { exact: true }).inputValue(), 'https://luma.com/example');
  const safe = await page.evaluate(() => {
    const svg = window.posterState.parsePosterSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image onload="alert(1)" href="https://evil.example/img"/><foreignObject><div>bad</div></foreignObject></svg>');
    return new XMLSerializer().serializeToString(svg);
  });
  assert.doesNotMatch(safe, /script|onload|evil|foreignObject/);
  await page.getByRole('button', { name: 'Reset all settings', exact: true }).click(); await svg.waitFor();
  await page.reload(); await svg.waitFor();
  assert.equal(await page.getByLabel('Background', { exact: true }).inputValue(), 'solid');
  assert.equal(await page.getByRole('button', { name: '8.5 x 11', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.setViewportSize({ width: 375, height: 812 });
  const mobileCanvas = await page.locator('.event-poster-preview').boundingBox();
  const mobileSettings = await page.locator('.event-poster-settings').boundingBox();
  assert.ok(mobileCanvas.y + mobileCanvas.height <= mobileSettings.y, 'mobile settings stack below poster');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile editor fits viewport');
  assert.deepEqual(errors, []);
  console.log('PASS: live edits without fetches, SVG export, reload persistence, all formats, SVG safety, click selection, reset');
} finally { await browser.close(); server.close(); }
