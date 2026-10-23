#!/usr/bin/env node
// Publish only registered check names and outcomes. Never publish logs or fixture data.
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

export const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const catalog = JSON.parse(readFileSync(resolve(root, 'web/src/data/test-status-catalog.json'), 'utf8'));
const store = resolve(root, '.local/test-status');
const output = resolve(root, 'web/public/test-status.json');
const receiptsPath = resolve(root, 'test-status/receipts.json');
function atomic(path, value) {
 mkdirSync(dirname(path), { recursive: true });
 const temporary = path + '.' + process.pid + '.tmp';
 writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n'); renameSync(temporary, path);
}
function group(id) {
 const found = catalog.groups.find(item => item.id === id);
 if (!found) throw Error('Unknown test group: ' + id);
 return found;
}
function load(id) {
 try { return JSON.parse(readFileSync(resolve(store, id + '.json'), 'utf8')); }
 catch { try { return JSON.parse(readFileSync(receiptsPath, 'utf8'))[id] || null; } catch { return null; } }
}
export function fingerprint(id, cache = new Map()) {
 const suite = group(id);
 const packageName = suite.source?.split('/')[0];
 const inputs = suite.kind === 'node' && ['org-worker', 'chat-worker'].includes(packageName) ? [packageName + '/src', packageName + '/migrations', 'shared', suite.source, packageName + '/package-lock.json']
  : suite.kind === 'browser' ? ['web/src', 'web/vite.config.ts', 'web/scripts/test-local-team-form.py', 'web/scripts/run-common-forms.py', 'web/docker/forms', 'org-worker/src', 'org-worker/migrations', 'shared']
  : suite.source ? [suite.source, 'web/src', 'web/package-lock.json', 'web/vite.config.ts', 'web/tsconfig.app.json', 'shared']
  : ['web/src', 'web/package-lock.json', 'web/vite.config.ts', 'web/tsconfig.app.json', 'org-worker/src', 'shared', 'org-worker/package-lock.json'];
 const hash = createHash('sha256');
 function digest(path) {
  if (cache.has(path)) return cache.get(path);
  const item = createHash('sha256');
  item.update(relative(root, path)); item.update('\0');
  if (!existsSync(path)) { item.update('missing'); }
  else if (statSync(path).isDirectory()) {
   for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isSymbolicLink() && !['__pycache__', 'node_modules', 'dist', 'generated'].includes(entry.name)) item.update(digest(resolve(path, entry.name)));
   }
  } else { item.update(readFileSync(path)); }
  const value = item.digest('hex'); cache.set(path, value); return value;
 }
 const webInputs = packageName === 'org-worker' || packageName === 'chat-worker' ? [] : ['cloudflare', ...readdirSync(resolve(root, 'web')).filter(name => name.endsWith('.mjs')).map(name => 'web/' + name)];
 for (const path of [...inputs, ...webInputs, 'scripts/test-status.mjs', 'scripts/test-status-reporter.mjs'].sort()) hash.update(digest(resolve(root, path)));
 return hash.digest('hex');
}
export function renderReport(records, fingerprints, now = new Date().toISOString()) {
 return { version: 1, title: catalog.title, generatedAt: now, environment: 'Isolated local tests', groups: catalog.groups.map(suite => {
  const record = records[suite.id];
  const stale = Boolean(record && record.fingerprint !== fingerprints[suite.id]);
  return { id: suite.id, label: suite.label, category: suite.category, source: suite.source, recordedAt: record?.recordedAt || null, revision: record?.revision || null, stale,
   cases: suite.cases.map(check => {
    const saved = record?.cases?.[check.id];
    return { id: check.id, label: check.label, status: !stale && ['passed', 'failed'].includes(saved?.status) ? saved.status : 'not_run', recordedAt: saved?.recordedAt || null, durationMs: saved?.durationMs ?? null };
   }) };
 }) };
}
export function publish() {
 const records = {}, fingerprints = {}, cache = new Map();
 for (const suite of catalog.groups) { records[suite.id] = load(suite.id); fingerprints[suite.id] = fingerprint(suite.id, cache); }
 atomic(output, renderReport(records, fingerprints));
}
export function sanitizeReceipt(suite, record, currentFingerprint) {
 if (!record || record.fingerprint !== currentFingerprint) return null;
 const cases = {};
 for (const check of suite.cases) {
  const saved = record.cases?.[check.id];
  if (saved && ['passed', 'failed', 'not_run'].includes(saved.status)) cases[check.id] = { status: saved.status, recordedAt: saved.recordedAt, ...(Number.isFinite(saved.durationMs) ? { durationMs: saved.durationMs } : {}) };
 }
 return { fingerprint: record.fingerprint, revision: record.revision, recordedAt: record.recordedAt, cases };
}
function exportReceipts() {
 const receipts = {};
 const cache = new Map();
 for (const suite of catalog.groups) {
  const receipt = sanitizeReceipt(suite, load(suite.id), fingerprint(suite.id, cache));
  if (receipt) receipts[suite.id] = receipt;
 }
 atomic(receiptsPath, receipts);
 publish();
}
function start(id, publishNow = true) {
 group(id);
 let revision = 'unknown';
 try {
  revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) revision += ' + working tree';
 } catch { /* Builds without Git still show accurate outcomes. */ }
 atomic(resolve(store, id + '.json'), { fingerprint: fingerprint(id), revision, recordedAt: new Date().toISOString(), cases: {} });
 if (publishNow) publish();
}
function saveCase(id, caseId, status, durationMs, publishNow = true) {
 const suite = group(id);
 if (!suite.cases.some(check => check.id === caseId) || !['passed', 'failed', 'not_run'].includes(status)) throw Error('Unknown check or status');
 const record = load(id);
 if (!record) throw Error('Start the test group before recording checks');
 record.recordedAt = new Date().toISOString();
 record.cases[caseId] = { status, recordedAt: record.recordedAt, ...(Number.isFinite(durationMs) ? { durationMs } : {}) };
 atomic(resolve(store, id + '.json'), record); if (publishNow) publish();
}
async function runSuite(id) {
 const suite = group(id);
 if (!['node', 'vitest'].includes(suite.kind)) throw Error('This suite uses its own browser/Python harness. Record its result with record-suite.');
 start(id);
 const cwd = resolve(root, suite.cwd || 'org-worker');
 if (suite.kind === 'vitest') {
  const reportPath = resolve(store, id + '-vitest.json');
  const child = spawn(process.execPath, [resolve(root, 'web/node_modules/vitest/vitest.mjs'), 'run', relative(cwd, resolve(root, suite.source)), '--maxWorkers=2', '--reporter=json', '--outputFile=' + reportPath], { cwd, stdio: 'inherit' });
  const code = await new Promise(resolveCode => { child.on('error', () => resolveCode(1)); child.on('exit', resolveCode); });
  let status = code === 0 ? 'not_run' : 'failed';
  if (code === 0) {
   try { if (JSON.parse(readFileSync(reportPath, 'utf8')).numPassedTests > 0) status = 'passed'; } catch { status = 'failed'; }
  }
  saveCase(id, 'suite', status);
  return code === 0 ? 0 : 1;
 }
 const child = spawn(process.execPath, [...(/\.tsx?$/.test(suite.source) ? ['--import', 'tsx'] : []), '--test', '--test-reporter=' + resolve(root, 'scripts/test-status-reporter.mjs'), resolve(root, suite.source)], { cwd, stdio: ['ignore', 'pipe', 'inherit'] });
 const completion = new Promise(resolveCode => { child.on('error', () => resolveCode(1)); child.on('exit', resolveCode); });
 let executed = 0;
 const lines = createInterface({ input: child.stdout });
 for await (const line of lines) {
  const result = JSON.parse(line);
  if (result.status !== 'not_run') executed++;
  if (suite.cases.some(check => check.id === result.name)) {
   saveCase(id, result.name, result.status, result.durationMs, false);
   process.stdout.write(`${result.status.toUpperCase()}: ${result.name}\n`);
  }
 }
 const code = await completion;
 if (suite.cases[0]?.id === 'suite') saveCase(id, 'suite', code !== 0 ? 'failed' : executed ? 'passed' : 'not_run', undefined, false);
 if (code !== 0) {
  const record = load(id);
  if (!Object.values(record.cases).some(check => check.status === 'failed')) {
   const first = suite.cases.find(check => !record.cases[check.id]);
   if (first) saveCase(id, first.id, 'failed');
  }
 }
 publish(); return code === 0 ? 0 : 1;
}
async function runChecks() {
 start('checks');
 let code = 0;
 for (const [id, cwd, command] of [['api-types', 'org-worker', 'typecheck'], ['web-build', 'web', 'build']]) {
  const began = Date.now();
  const child = spawn('npm', ['run', command], { cwd: resolve(root, cwd), stdio: 'inherit' });
  const passed = await new Promise(resolveCode => { child.on('error', () => resolveCode(false)); child.on('exit', value => resolveCode(value === 0)); });
  saveCase('checks', id, passed ? 'passed' : 'failed', Date.now() - began);
  if (!passed) code = 1;
 }
 return code;
}
export function aggregateStatus(results) {
 return results.some(status => status === 'failed') ? 'failed' : results.some(status => status === 'passed') ? 'passed' : 'not_run';
}
async function capture(kind) {
 const selected = catalog.groups.filter(suite => kind === 'web' ? suite.kind === 'vitest' : kind === 'api' ? /^org-worker\/test\/[^/]+\.test\.ts$/.test(suite.source || '') : /^(cloudflare|web\/tests\/unit)\/[^/]+\.test\.mjs$/.test(suite.source || ''));
 if (!['web', 'api', 'routing'].includes(kind) || !selected.length) throw Error('Choose web, api or routing checks');
 // The inventory must never silently narrow the release gate's original globs.
 const directories = kind === 'api' ? ['org-worker/test'] : kind === 'routing' ? ['cloudflare', 'web/tests/unit'] : [];
 const expected = directories.flatMap(directory => readdirSync(resolve(root, directory)).filter(name => name.endsWith(kind === 'api' ? '.test.ts' : '.test.mjs')).map(name => directory + '/' + name));
 if (expected.some(source => !selected.some(suite => suite.source === source))) throw Error('Regenerate the test catalog before running release checks');
 for (const suite of selected) start(suite.id, false);
 publish();
 const path = resolve(store, 'release-' + kind + (kind === 'web' ? '.json' : '.ndjson'));
 // Remove the previous capture so an interrupted runner cannot reuse old results.
 writeFileSync(path, '');
 const cwd = kind === 'web' ? resolve(root, 'web') : kind === 'api' ? resolve(root, 'org-worker') : root;
 const args = kind === 'web'
  ? [resolve(root, 'web/node_modules/vitest/vitest.mjs'), 'run', '--maxWorkers=2', '--reporter=default', '--reporter=json', '--outputFile=' + path]
  : [...(kind === 'api' ? ['--import', 'tsx'] : []), '--test', '--test-reporter=spec', '--test-reporter=' + resolve(root, 'scripts/test-status-reporter.mjs'), '--test-reporter-destination=stdout', '--test-reporter-destination=' + path, ...selected.map(suite => resolve(root, suite.source))];
 const child = spawn(process.execPath, args, { cwd, stdio: 'inherit' });
 const code = await new Promise(resolveCode => { child.on('error', () => resolveCode(1)); child.on('exit', resolveCode); });
 let rows;
 try {
  rows = kind === 'web' ? JSON.parse(readFileSync(path, 'utf8')).testResults.map(file => ({ file: file.name, name: 'suite', status: file.status === 'failed' ? 'failed' : aggregateStatus(file.assertionResults.map(check => check.status)) })) : readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
 } catch { throw Error('The test runner did not produce a valid result capture'); }
 for (const suite of selected) {
  const results = rows.filter(row => row.file && resolve(row.file) === resolve(root, suite.source));
  if (suite.cases[0]?.id === 'suite') saveCase(suite.id, 'suite', aggregateStatus(results.map(row => row.status)), undefined, false);
  else {
   for (const check of suite.cases) {
    const matching = results.filter(row => row.name === check.id);
    if (matching.length) saveCase(suite.id, check.id, aggregateStatus(matching.map(row => row.status)), undefined, false);
   }
   if (aggregateStatus(results.map(row => row.status)) === 'failed' && !Object.values(load(suite.id).cases).some(check => check.status === 'failed')) saveCase(suite.id, suite.cases[0].id, 'failed', undefined, false);
  }
 }
 publish();
 if (code !== 0 || rows.some(row => row.status === 'failed')) return 1;
 if (selected.some(suite => !rows.some(row => row.file && resolve(row.file) === resolve(root, suite.source)))) throw Error('Some expected suites were not reported');
 return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const [action = 'refresh', ...ids] = process.argv.slice(2);
 if (action === 'refresh') publish();
 else if (action === 'export') exportReceipts();
 else if (action === 'start') start(ids[0]);
 else if (action === 'case') saveCase(ids[0], ids[1], ids[2]);
 else if (action === 'record-suite') { start(ids[0]); saveCase(ids[0], 'suite', ids[1]); }
 else if (action === 'finish') {
  const record = load(ids[0]);
  if (ids[1] !== '0' && record && !Object.values(record.cases).some(check => check.status === 'failed')) {
   const next = group(ids[0]).cases.find(check => !record.cases[check.id]);
   if (next) saveCase(ids[0], next.id, 'failed');
  }
  publish();
 }
 else if (action === 'checks') process.exitCode = await runChecks();
 else if (action === 'capture') process.exitCode = await capture(ids[0]);
 else if (action === 'run') {
  for (const id of ids.length ? ids : catalog.groups.filter(suite => ['node', 'vitest'].includes(suite.kind)).map(suite => suite.id)) if (await runSuite(id)) process.exitCode = 1;
 } else throw Error('Usage: node scripts/test-status.mjs refresh|run [group IDs]|checks|start ID|case ID CHECK STATUS');
}
