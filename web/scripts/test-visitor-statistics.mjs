import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from '@playwright/test';

// Isolated UI fixture: no real login, data writes, or production requests.
const entry = '/visitor-statistics-fixture.tsx';
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({
  root, configFile: false, cacheDir: '.tmp/visitor-statistics-vite', plugins: [react(), {
    name: 'visitor-statistics-fixture',
    resolveId(id) { if (id === entry) return entry; },
    load(id) {
      if (id === entry) return `import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {VisitorStatistics} from '/src/ui/views/VisitorStatistics.tsx';
        import '/src/ui/views/admin.css';
        createRoot(document.getElementById('root')).render(<VisitorStatistics token="fixture-admin" />);`;
    },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url !== '/__visitor-statistics-fixture') return next();
        res.setHeader('content-type', 'text/html');
        res.end(await vite.transformIndexHtml(req.url, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`));
      });
    },
  }], server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const fixture = {
    status: 'ready', source: 'Cloudflare Web Analytics', start: '2026-10-09T00:00:00.000Z', end: '2026-10-16T00:00:00.000Z',
    hosts: ['orgportal.cc', 'lifetech.fyi'], page_views: 120, visits: 40,
    daily: [{ date: '2026-10-15', host: 'orgportal.cc', page_views: 120, visits: 40 }],
    top_pages: [{ host: 'orgportal.cc', path: '/events/example', page_views: 100, visits: 30 }],
  };
  let mode = 'ready';
  const queries = [];
  await page.route('**/api/org/api/admin/visitor-statistics?*', async route => {
    const req = route.request();
    assert.equal(req.headers().authorization, 'Bearer fixture-admin');
    queries.push(new URL(req.url()).searchParams);
    const body = mode === 'ready' ? fixture : mode === 'empty' ? { ...fixture, page_views: 0, visits: 0, daily: [], top_pages: [] }
      : { status: mode, message: mode === 'not_configured' ? 'Visitor statistics need a Cloudflare Analytics read credential.' : 'Cloudflare visitor statistics are temporarily unavailable. Try again later.' };
    await route.fulfill({ status: mode === 'unavailable' ? 503 : 200, json: body });
  });
  await page.goto(`${server.resolvedUrls.local[0]}__visitor-statistics-fixture`);
  await page.getByRole('rowheader', { name: '/events/example', exact: true }).waitFor();
  assert.ok(await page.getByText('120', { exact: true }).count());
  assert.ok(await page.getByText('40', { exact: true }).count());
  await page.getByLabel('Period').selectOption('30');
  await page.getByRole('button', { name: 'Refresh visitors' }).waitFor();
  await page.waitForFunction(() => !document.querySelector('button')?.disabled);
  assert.equal(queries.at(-1).get('days'), '30');
  await page.getByLabel('Website').selectOption('lifetech.fyi');
  await page.waitForFunction(() => !document.querySelector('button')?.disabled);
  assert.equal(queries.at(-1).get('host'), 'lifetech.fyi');
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  for (mode of ['not_configured', 'unavailable', 'empty']) {
    await page.getByRole('button', { name: 'Refresh visitors' }).click();
    await page.waitForFunction(() => !document.querySelector('button')?.disabled);
    if (mode === 'empty') await page.getByText('No visitor traffic reported for this period.').waitFor();
    else {
      await page.getByRole('status').waitFor();
      assert.equal(await page.getByText('120', { exact: true }).count(), 0);
      assert.equal(await page.getByText('0', { exact: true }).count(), 0);
    }
  }
  assert.deepEqual(errors, []);
  console.log('Visitor statistics browser checks passed: counts, period/host filters, mobile layout, missing configuration, provider outage, and empty traffic.');
} finally {
  await browser?.close();
  await server.close();
}
