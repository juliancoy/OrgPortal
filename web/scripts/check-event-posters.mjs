import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import jsQR from 'jsqr';
import { renderEventPoster, posterGeometry } from '../../org-worker/src/eventPoster.ts';

const directory = process.env.POSTER_SHOTS || '/tmp/orgportal-posters';
await mkdir(directory, { recursive: true });
const url = 'https://medtech.social/events/medtech-in-the-hut';
const event = { title: 'MedTech in the Hut', starts_at: '2026-09-29T22:00:00Z', ends_at: '2026-09-30T00:30:00Z',
  location: 'NOLA Seafood & Spirits, 36 E Cross St, Baltimore, MD 21230',
  description: 'A formational gathering for people building across health, medicine, science, technology, and civic life in Baltimore.' };
const logo = await readFile(new URL('../public/images/baltimore-medtech-logo-square.jpg', import.meta.url));
const brand = { name: 'Baltimore MedTech', tagline: 'Health x Medicine x Biotech', logo: `data:image/jpeg;base64,${logo.toString('base64')}` };
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const long of [false, true]) for (const format of ['letter', 'letter-4up', 'postcard', 'social']) {
    const svg = await renderEventPoster(long ? { ...event, title: 'Building the future of community health: collaboration across medicine, biotechnology, research and civic life', location: event.location + ' - Community gathering space and accessible entrance on the east side' } : event, url, format, brand);
    const { width, height } = posterGeometry(format);
    await page.setViewportSize({ width, height });
    await page.setContent(`<style>body{margin:0}body>svg{display:block;width:100%;height:100%}</style>${svg.replace(/^<\?xml[^>]*>/, '')}`);
    if (format === 'letter-4up') {
      const copies = await page.locator('use').evaluateAll(nodes => nodes.map(node => {
        const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom };
      }));
      assert.equal(copies.length, 4);
      for (const copy of copies) assert.ok(copy.x >= 25 && copy.y >= 25 && copy.right <= width - 25 && copy.bottom <= height - 25);
      assert.ok(copies[0].right < copies[1].x && copies[0].bottom < copies[2].y);
    }
    const boxes = await page.locator('svg > text, #poster-art > text').evaluateAll(nodes => nodes.filter(n => n.textContent).map(n => {
      const b = n.getBBox(); return { text: n.textContent, x: b.x, y: b.y, width: b.width, height: b.height };
    }));
    for (const box of boxes) assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, `${format}: text outside canvas: ${box.text}`);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(!(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y), `${format}: overlapping text: ${a.text} / ${b.text}`);
    }
    const pixels = await page.evaluate(async ({ svg, width, height }) => {
      const image = new Image(); image.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height * 2;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const qr = new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('svg svg');
      const copies = [...document.querySelectorAll('use')];
      const transforms = copies.length ? copies.map(copy => copy.transform.baseVal.consolidate().matrix) : [new DOMMatrix()];
      const crops = transforms.map(matrix => {
        const position = new DOMPoint(Number(qr.getAttribute('x')), Number(qr.getAttribute('y'))).matrixTransform(matrix);
        const data = context.getImageData(position.x * 2, position.y * 2, Number(qr.getAttribute('width')) * matrix.a * 2, Number(qr.getAttribute('height')) * matrix.d * 2);
        return { data: Array.from(data.data), width: data.width, height: data.height };
      });
      URL.revokeObjectURL(image.src);
      return crops;
    }, { svg, width, height });
    assert.equal(pixels.length, format === 'letter-4up' ? 4 : 1);
    for (const crop of pixels) assert.equal(jsQR(new Uint8ClampedArray(crop.data), crop.width, crop.height)?.data, url, `${format}: QR does not decode`);
    await page.screenshot({ path: `${directory}/${format}${long ? '-long' : ''}.png` });
    console.log(`${format}${long ? ' long text' : ''}: bounds, non-overlap and QR passed`);
  }
} finally { await browser.close(); }
