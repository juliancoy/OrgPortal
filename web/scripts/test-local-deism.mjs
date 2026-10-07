import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, expect as baseExpect } from '@playwright/test';

const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8878';
const community = base + '/community';
const site = process.env.DEISM_SITE_URL || 'http://localhost:8878';
const local = url => ['localhost', '127.0.0.1'].includes(new URL(url).hostname);
assert.ok(local(base) && local(site), 'Use only the local Docker deployment');
const inspect = name => JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }))[0];
const org = inspect('deism-community-api');
assert.ok(org.State.Running);
assert.ok(!org.Config.Cmd.join(' ').includes('--var ORGANIZATION_REPLICA_SOURCE:'), 'Use an isolated writable fixture database');
const pidp = inspect('deism-identity-api');
const env = Object.fromEntries(pidp.Config.Env.map(value => value.split(/=(.*)/s).slice(0, 2)));
assert.ok(env.ALLOWED_ORIGINS.split(',').includes(base));
assert.equal(env.EMAIL_VERIFICATION_DELIVERY, 'log');
const expect = baseExpect.configure({ timeout: 30000 });
const artifacts = new URL('../.local/deism-clickthrough/', import.meta.url);
mkdirSync(artifacts, { recursive: true, mode: 0o700 });
const results = [];
const pass = message => { results.push(message); console.log('PASS: ' + message); };
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
let context;
try {
  context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York' });
  // No browser authentication, application data, or test account leaves localhost.
  await context.route('**/*', route => local(route.request().url()) ? route.continue() : route.abort());
  for (const path of ['/api/org/health', '/pidp/health']) assert.ok((await context.request.get(base + path)).ok());
  const tenant = await (await context.request.get(base + '/api/org/api/portal/tenant')).json();
  assert.equal(tenant.id, 'deism');
  assert.equal(tenant.hostname, 'portal.deism.church');
  const replication = await (await context.request.get(base + '/api/org/api/network/replication/status')).json();
  assert.equal(replication.mode, 'primary');
  pass('local portal, PIdP, and isolated Deism tenant preflight');

  const page = await context.newPage();
  const portalErrors = [];
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame() && frame.url() !== 'about:blank') assert.equal(new URL(frame.url()).origin, base, 'Navigation left the combined Deism origin');
  });
  page.on('pageerror', error => { if (page.url().startsWith(base)) portalErrors.push(error.message); });
  page.on('response', response => {
    if (response.url().startsWith(base + '/api/') && response.status() >= 500) portalErrors.push('API HTTP ' + response.status() + ': ' + new URL(response.url()).pathname);
  });
  await page.goto(site);
  await expect(page.getByRole('heading', { name: 'Church of God (Deist)', exact: true })).toBeVisible();
  await expect(page.locator('.hero-image')).toHaveAttribute('src', '/images/church-hero.png');
  await page.screenshot({ path: new URL('website-latest-home.png', artifacts).pathname, fullPage: true });
  await page.getByRole('link', { name: 'Read the Book of Doctrine', exact: true }).click();
  await expect(page).toHaveURL(site + '/book_of_doctrine/');
  await expect(page.locator('#overview-tree')).toContainText('Nature');
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await page.locator('img').evaluateAll(async images => {
      if (!images.length) throw new Error('Doctrine diagrams are missing');
      await Promise.all(images.map(image => image.decode()));
    });
  }
  pass('doctrine diagrams decode in light and dark mode');
  await page.locator('#navSearchInput').fill('annihilation');
  await expect(page.locator('#navSearchResults button').first()).toBeVisible();
  await page.locator('#navSearchInput').press('ArrowDown');
  await page.locator('#navSearchInput').press('ArrowUp');
  await expect(page.locator('#navSearchResults button').first()).toHaveClass(/is-active/);
  await page.locator('#navSearchInput').press('Enter');
  await expect(page).toHaveURL(/annihilation/);
  await expect(page.locator('#selected-node-text')).toContainText('Universal Annihilation');
  pass('latest landing page → doctrine reader → fuzzy search and keyboard navigation');
  await page.goto(site);
  await page.getByRole('link', { name: 'Hadith', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Curriculum', exact: true })).toBeVisible();
  await expect(page.locator('#curriculumList .section-title').first()).toBeVisible();
  await page.screenshot({ path: new URL('website-hadith.png', artifacts).pathname, fullPage: true });
  pass('latest Hadith curriculum click-through');
  await page.goto(site);
  await page.getByRole('link', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(base + '/users/login');
  await expect(page.getByRole('link', { name: 'Continue with email', exact: true })).toBeVisible();
  pass('local website Login uses Deism OrgPortal');
  await page.goto(site);
  await expect(page.getByRole('link', { name: 'Community', exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Community', exact: true }).first().click();
  await expect(page.locator('#tenant-home-title')).toHaveText('Deism');
  await expect(page.getByRole('link', { name: 'Join Deism', exact: true })).toBeVisible();
  assert.equal(await page.locator('html').getAttribute('data-portal-profile'), 'deism');
  const icon = await page.locator('link[rel="icon"]').getAttribute('href');
  assert.ok(icon.includes('/images/deism/'));
  assert.ok((await context.request.get(new URL(icon, base).href)).ok());
  const manifest = await (await context.request.get(base + '/deism.webmanifest')).json();
  assert.equal(manifest.name, 'Deism Portal');
  await page.screenshot({ path: new URL('desktop-home.png', artifacts).pathname, fullPage: true });
  pass('website → Community Portal, Deism branding, icon, and install manifest');

  await page.getByRole('link', { name: 'Community Events', exact: true }).click();
  await expect(page).toHaveURL(base + '/org-events');
  await expect(page.locator('main').first()).toContainText('Deism');
  await expect(page.getByRole('link', { name: 'Open event details for Deism Local Community Gathering', exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Open event details for Deism Local Community Gathering', exact: true }).first().click();
  await expect(page).toHaveURL(base + '/events/deism-local-community-gathering');
  await expect(page.locator('main').first()).toContainText('Local test venue');
  pass('landing page → Deism organization events → sample event detail');
  await page.goto(community);
  const doctrine = page.getByRole('link', { name: 'Book of Doctrine', exact: false }).first();
  assert.ok((await doctrine.getAttribute('href')).startsWith(site));
  const [book] = await Promise.all([context.waitForEvent('page'), doctrine.click()]);
  await book.waitForLoadState('domcontentloaded');
  assert.ok(book.url().startsWith(site));
  await book.close();
  pass('doctrine resource opens the local Deism website');

  // Provision a local owner and member with explicit proof of both credentials.
  const account = { email: `deism-${randomUUID()}@example.com`, password: randomBytes(24).toString('base64url'), full_name: 'Local Deism Tester' };
  async function verifyAccount(app = '') {
    let verification;
    for (let attempt = 0; attempt < 30 && !verification; attempt++) {
      const logResult = spawnSync('docker', ['logs', '--since', '5m', 'deism-identity-api'], { encoding: 'utf8' });
      const logs = logResult.stdout + logResult.stderr;
      for (const candidate of logs.match(/https?:\/\/[^\s]+/g) || []) {
        const url = new URL(candidate);
        if (url.pathname.endsWith('/auth/verify-email') && url.searchParams.get('email') === account.email && (url.searchParams.get('app') || '') === app) {
          assert.ok(local(candidate));
          verification = base + '/pidp/auth/verify-email' + url.search;
        }
      }
      if (!verification) await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(verification, 'No local verification mail');
    const verified = await context.request.get(verification, { maxRedirects: 0 });
    assert.equal(verified.status(), 303);
    assert.ok(!verified.headers().location.includes('error='));
  }
  assert.ok((await context.request.post(base + '/pidp/auth/register', { data: account })).ok());
  await verifyAccount();
  const ownerResponse = await context.request.post(base + '/pidp/auth/token', { form: { username: account.email, password: account.password } });
  assert.ok(ownerResponse.ok());
  const ownerToken = (await ownerResponse.json()).access_token;
  const ownerHeaders = { Authorization: 'Bearer ' + ownerToken };
  const appResponse = await context.request.post(base + '/pidp/websites', { headers: ownerHeaders, data: { name: 'Local OrgPortal', slug: 'code-collective', allowed_redirect_origins: [base] } });
  assert.ok(appResponse.ok() || appResponse.status() === 409, 'Local portal app registration failed');
  assert.ok((await context.request.post(base + '/pidp/websites/code-collective/auth/register', { data: account })).ok());
  await verifyAccount('code-collective');
  const memberResponse = await context.request.post(base + '/pidp/websites/code-collective/auth/token', { data: { email: account.email, password: account.password } });
  assert.ok(memberResponse.ok());
  const memberToken = (await memberResponse.json()).access_token;
  const previewResponse = await context.request.post(base + '/pidp/auth/account-links/preview', { headers: ownerHeaders, data: { member_token: memberToken } });
  assert.ok(previewResponse.ok());
  const preview = await previewResponse.json();
  const linked = await context.request.post(base + '/pidp/auth/account-links/apply', { headers: ownerHeaders, data: { member_token: memberToken, previewId: preview.previewId, confirm: true } });
  assert.ok(linked.ok());
  pass('local portal app, verified member, and explicit credential-proven identity link');
  await page.getByRole('link', { name: 'Join Deism', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Continue with email', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Continue with email', exact: true }).click();
  assert.ok(local(page.url()));
  await page.locator('#login-email').fill(account.email);
  await page.locator('#login-password').fill(account.password);
  await page.locator('form').filter({ has: page.locator('#login-email') }).locator('button[type="submit"]').click();
  await expect(page).toHaveURL(base + '/chat', { timeout: 30000 });
  await expect(page.locator('main').first()).toBeVisible();
  pass('Join Deism → email sign-in → local PIdP → portal chat');
  await page.reload();
  await expect(page).toHaveURL(base + '/chat');
  await expect(page.locator('main').first()).toBeVisible();
  const state = await context.storageState();
  const second = await browser.newContext({ ignoreHTTPSErrors: true, storageState: state });
  await second.route('**/*', route => local(route.request().url()) ? route.continue() : route.abort());
  const resumed = await second.newPage();
  await resumed.goto(base + '/users/login');
  await expect(resumed).toHaveURL(base + '/chat', { timeout: 30000 });
  await second.close();
  pass('authenticated session survives reload and a new browser context');

  await page.goto(base + '/orgs/deism');
  await expect(page.locator('main').first()).toContainText('Church of God (Deist)');
  await page.screenshot({ path: new URL('desktop-organization.png', artifacts).pathname, fullPage: true });
  pass('Deism organization profile loads under the tenant');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/chat', '/people', '/calendar', '/org-events']) {
    await page.goto(base + path);
    await expect(page.locator('main').first()).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile overflow: ' + path);
    await page.screenshot({ path: new URL('mobile-' + path.slice(1) + '.png', artifacts).pathname, fullPage: true });
  }
  pass('mobile chat, people, calendar, and events without horizontal overflow');
  assert.deepEqual(portalErrors, [], 'Portal runtime or API failures');
  pass('no portal runtime errors or API server failures');
  writeFileSync(new URL('results.json', artifacts), JSON.stringify({ base, site, results }, null, 2));
} catch (error) {
  if (context?.pages()[0]) await context.pages()[0].screenshot({ path: new URL('failure.png', artifacts).pathname, fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
