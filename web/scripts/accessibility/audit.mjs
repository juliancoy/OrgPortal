import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'vite';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFixtures } from './fixtures.mjs';

const webRoot = fileURLToPath(new URL('../../', import.meta.url));
const useOrca = process.env.A11Y_ORCA === '1';
const output = path.resolve(process.env.A11Y_OUTPUT || path.join(webRoot, '.tmp/accessibility', useOrca ? 'orca' : 'browser'));
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-a11y-'));
await fs.mkdir(output, { recursive: true });
const speechFile = path.join(output, 'orca-debug.log');
const report = { startedAt: new Date().toISOString(), screenReader: useOrca ? 'Orca' : null, mode: 'Local synthetic fixtures; all APIs intercepted', scans: [], checks: [], errors: [] };
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
let server, browser, orca;
let speechCalibrated = false;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const readSpeech = async () => (await fs.readFile(speechFile, 'utf8').catch(() => '')).split('\n').filter(line => line.includes('SPEECH OUTPUT:'));
async function speechMark() { await delay(350); return (await readSpeech()).length; }
async function speechSince(mark) {
  if (!useOrca) return [];
  await delay(900);
  return (await readSpeech()).slice(mark).map(line => line.replace(/^.*?SPEECH OUTPUT: /, ''));
}
function check(name, passed, detail) {
  report.checks.push({ name, passed: Boolean(passed), detail });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
}
async function key(page, keyName) {
  if (useOrca) execFileSync('xdotool', ['key', '--clearmodifiers', keyName]);
  else await page.keyboard.press({ Return: 'Enter', Escape: 'Escape', Tab: 'Tab', 'shift+Tab': 'Shift+Tab' }[keyName] || keyName);
  await delay(100);
}
async function newPage(member = false, theme = 'light') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme, serviceWorkers: 'block' });
  await context.addInitScript(t => localStorage.setItem('orgportal.theme', t), theme);
  await installFixtures(context, { member });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  return page;
}
async function goto(page, route) {
  await page.goto(report.baseURL + route);
  await page.locator('main').first().waitFor();
  await delay(700);
  if (await page.getByText('Unexpected Application Error!', { exact: true }).count()) throw new Error(`Application crashed on ${route}`);
  // Stop Orca's automatic page reading before establishing a focused test state.
  // Otherwise its SayAll interruption can restore an earlier caret on first Tab.
  if (useOrca) await key(page, 'Control_L');
}
async function scan(page, name) {
  const axe = await new AxeBuilder({ page }).withTags(tags).analyze();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  report.scans.push({ name, url: page.url(), viewport: page.viewportSize(), overflow, axeVersion: axe.testEngine.version,
    violations: axe.violations.map(v => ({ id: v.id, impact: v.impact, tags: v.tags, help: v.help, nodes: v.nodes.map(n => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })) })),
    incomplete: axe.incomplete.map(v => ({ id: v.id, count: v.nodes.length })) });
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  console.log(`SCAN ${name}: ${axe.violations.length} WCAG rule failures, ${overflow}px overflow`);
}
async function dialogCheck(page, name, open, selector = '[role="dialog"]') {
  const mark = await speechMark();
  await open();
  await page.locator(selector).waitFor();
  const inside = await page.evaluate(selector => Boolean(document.activeElement.closest(selector)), selector);
  const announcement = await speechSince(mark);
  check(`${name}: initial focus inside`, inside, { announcement });
  const escapes = [];
  for (let i = 0; i < 8; i++) {
    await key(page, 'Tab');
    const focus = await page.evaluate(selector => ({ inside: Boolean(document.activeElement.closest(selector)), tag: document.activeElement.tagName, name: document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.slice(0,80) }), selector);
    if (!focus.inside) escapes.push(focus);
  }
  check(`${name}: Tab stays inside`, escapes.length === 0, escapes);
  await scan(page, name);
  await key(page, 'Escape');
  check(`${name}: Escape closes`, await page.locator(selector).count() === 0, null);
}
async function scenario(name, run) {
  if (process.env.A11Y_SCENARIO && process.env.A11Y_SCENARIO !== name) return;
  try { await run(); } catch (error) { report.errors.push({ name, error: String(error) }); console.error(`ERROR ${name}: ${error.message}`); }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
}

try {
  server = await createServer({ root: webRoot, configFile: path.join(webRoot, 'vite.config.ts'), cacheDir: path.join(scratch, 'vite'), server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
  await server.listen();
  report.baseURL = `http://127.0.0.1:${server.httpServer.address().port}`;
  if (useOrca) {
    if (!process.env.DISPLAY || !process.env.DBUS_SESSION_BUS_ADDRESS) throw new Error('Run through npm run test:a11y:orca for desktop isolation');
    const prefs = path.join(scratch, 'orca'); await fs.mkdir(prefs);
    // Orca 46 buffers its debug file. Only change diagnostic flushing, never
    // speech generation, so a real announcement is not mistaken for silence.
    await fs.writeFile(path.join(prefs, 'orca-customizations.py'), 'from orca import debug\nif debug.debugFile:\n    debug.debugFile.reconfigure(line_buffering=True, write_through=True)\n');
    orca = spawn('orca', ['--user-prefs', prefs, '--debug-file', speechFile, '--enable', 'speech', '--disable', 'braille'], { stdio: ['ignore','ignore','pipe'] });
    const errors = [];
    orca.stderr.on('data', d => errors.push(String(d)));
    orca.on('error', e => report.errors.push({ name: 'Orca launch', error: String(e) }));
    report.orcaVersion = execFileSync('orca', ['--version'], { encoding: 'utf8' }).trim();
    await delay(700);
  }
  browser = await chromium.launch({ headless: !useOrca, ignoreDefaultArgs: useOrca ? ['--disable-renderer-accessibility'] : [], args: useOrca ? ['--force-renderer-accessibility', '--ozone-platform=x11'] : [] });
  report.browserVersion = browser.version();

  await scenario('screen reader calibration and login', async () => {
    const page = await newPage();
    try {
      if (useOrca) {
        await page.goto('data:text/html,<html lang="en"><title>Speech calibration</title><main><h1>Speech calibration</h1><label>Calibration field<input id="calibration"></label><button>Calibration button</button><p role="status" id="status"></p></main></html>');
        await delay(1000);
        await key(page, 'Control_L');
        let mark = await speechMark(); await page.locator('#calibration').focus();
        let spoken = await speechSince(mark); const namedInputWorking = spoken.some(s=>s.includes('Calibration field'));
        check('Orca announces a named input', namedInputWorking, spoken);
        mark = await speechMark(); await page.evaluate(()=>document.querySelector('#status').textContent='Accessibility calibration ready');
        spoken = await speechSince(mark); const working = spoken.some(s=>s.includes('Accessibility calibration ready'));
        check('Orca live-region calibration', working, spoken);
        speechCalibrated = working;
        if (!working || !namedInputWorking) throw new Error('Screen reader calibration failed; portal announcements are inconclusive');
      }
      await goto(page, '/users/login');
      let mark = await speechMark(); await page.locator('#email').click();
      let spoken = await speechSince(mark); if (useOrca) check('Orca announces login Email', spoken.some(s=>s.includes('Email')), spoken);
      mark = await speechMark(); await key(page, 'Tab'); spoken = await speechSince(mark);
      if (useOrca) check('Orca announces login Password', spoken.some(s=>s.includes('Password')), spoken);
      await scan(page, 'login-light');
      await page.getByRole('link', { name: 'Departments', exact: true }).click(); await page.waitForURL('**/departments'); await delay(300);
      check('Departments has its own page title', (await page.title()).includes('Departments'), await page.title());
      await goto(page, '/finance');
      const financeName = await page.getByRole('combobox').last().getAttribute('aria-label');
      await scan(page, 'finance-light');
      if (useOrca) { mark = await speechMark(); await page.locator('select').last().focus(); spoken = await speechSince(mark); report.checks.push({name:'Orca finance sort announcement (observation)',passed:null,detail:{spoken,ariaLabel:financeName}}); }
    } finally { await page.context().close(); }
  });

  await scenario('registration error dialog', async () => {
    const page = await newPage(); try {
      await goto(page, '/users/register'); await page.locator('#email').fill('audit@example.test'); await page.locator('#pw').fill('Synthetic-password-123'); await page.locator('.portal-auth-submit').focus();
      await dialogCheck(page, 'registration-error', ()=>key(page, 'Return'), '[role="alertdialog"]');
    } finally { await page.context().close(); }
  });

  await scenario('profile photo dialog', async () => {
    const page = await newPage(true, 'dark'); try {
      await goto(page, '/profile'); await page.getByRole('button', { name: 'Add photo', exact: true }).focus();
      await dialogCheck(page, 'photo-dialog-dark', ()=>page.locator('#profile-photo-upload').setInputFiles(path.join(webRoot,'public/codecollective_logo.png')));
    } finally { await page.context().close(); }
  });

  await scenario('chat failure announcement', async () => {
    const page = await newPage(true); try {
      await goto(page, '/chat/a11y-dm');
      if (useOrca) {
        // A positive control in this context makes a missing error announcement
        // distinguishable from a screen reader that stopped processing events.
        await page.evaluate(() => {
          const status = document.createElement('p'); status.id = 'a11y-calibration';
          status.setAttribute('role', 'status'); document.body.append(status);
        });
        const mark = await speechMark();
        await page.evaluate(() => document.querySelector('#a11y-calibration').textContent = 'Chat calibration ready');
        const spoken = await speechSince(mark);
        speechCalibrated = spoken.some(s => s.includes('Chat calibration ready'));
        check('Orca chat live-region calibration', speechCalibrated, spoken);
        await page.locator('#a11y-calibration').evaluate(e => e.remove());
        if (!speechCalibrated) throw new Error('Chat screen reader calibration failed; error announcements are inconclusive');
      }
      await page.getByRole('textbox', {name:'Message',exact:true}).fill('Synthetic audit message'); await page.getByRole('button',{name:'Send',exact:true}).focus();
      const mark = await speechMark(); await key(page, 'Return'); await page.getByText('Message service unavailable',{exact:true}).waitFor();
      const spoken = await speechSince(mark);
      if (useOrca && speechCalibrated) check('Orca announces chat send failure', spoken.some(s=>/unavailable|failed/i.test(s)), spoken);
      const live = await page.getByText('Message service unavailable',{exact:true}).evaluate(e=>Boolean(e.closest('[role="alert"],[role="status"],[aria-live="polite"],[aria-live="assertive"]')));
      check('Chat error is in an alert/live region',live,null); await scan(page,'chat-error-light');
    } finally { await page.context().close(); }
  });

  await scenario('timebank dialog', async () => {
    const page = await newPage(true); try {
      await goto(page, '/timebanking'); const add = page.getByRole('button',{name:'Add offer',exact:true}); await add.waitFor(); await add.focus();
      await dialogCheck(page,'timebank-dialog',()=>key(page,'Return'),'dialog[open]');
      check('Timebank restores focus to Add offer',await add.evaluate(e=>e===document.activeElement),null);
    } finally { await page.context().close(); }
  });

  await scenario('theme and narrow-layout scans', async () => {
    for (const theme of ['light','dark']) for (const [route,member] of [['/users/login',false],['/users/register',false],['/about',false],['/profile',true],['/settings',true],['/id',true],['/calendar',true],['/timebanking',true]]) {
      const page = await newPage(member, theme);
      try {
        await goto(page,route); await page.setViewportSize({width:320,height:900});
        await scan(page,`${route.replaceAll('/','_')}-${theme}-320`);
      } finally { await page.context().close(); }
    }
  });
} catch (error) { report.errors.push({name:'harness',error:String(error)}); }
finally {
  await browser?.close();
  if (orca && orca.exitCode === null) { orca.kill('SIGTERM'); await Promise.race([once(orca,'exit'),delay(3000)]); if(orca.exitCode === null) orca.kill('SIGKILL'); }
  await server?.close();
  if (!report.scans.length && !report.errors.length) report.errors.push({name:'coverage',error:'No scenarios ran; check A11Y_SCENARIO'});
  report.finishedAt = new Date().toISOString();
  report.summary = { assertionsPassed: report.checks.filter(c=>c.passed===true).length, assertionsFailed: report.checks.filter(c=>c.passed===false).length, scans:report.scans.length, scansWithViolations:report.scans.filter(s=>s.violations.length).length, harnessErrors:report.errors.length };
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');
  if(useOrca) await fs.writeFile(path.join(output,'speech.txt'),(await readSpeech()).join('\n')+'\n');
  await fs.rm(scratch,{recursive:true,force:true});
  console.log(JSON.stringify(report.summary)); console.log(`Results: ${path.join(output,'results.json')}`);
  process.exitCode = report.errors.length ? 2 : report.summary.assertionsFailed || report.summary.scansWithViolations ? 1 : 0;
}
