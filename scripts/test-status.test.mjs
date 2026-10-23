import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { catalog, renderReport, root, sanitizeReceipt, aggregateStatus } from './test-status.mjs';

test('missing, partial, failed and stale reports never invent passing results or leak payloads', () => {
 const suite = catalog.groups.find(group => group.id === 'applications-api');
 const first = suite.cases[0].id, second = suite.cases[1].id;
 const records = { [suite.id]: { fingerprint: 'current', recordedAt: '2026-10-23T00:00:00Z', cases: {
  [first]: { status: 'passed' }, [second]: { status: 'failed' }, secret: { status: 'passed', token: 'never-publish-this' }
 }, rawLog: 'never-publish-this' } };
 const report = renderReport(records, { [suite.id]: 'current' });
 const checks = report.groups.find(group => group.id === suite.id).cases;
 assert.equal(checks[0].status, 'passed'); assert.equal(checks[1].status, 'failed');
 assert.equal(checks[2].status, 'not_run');
 assert.equal(JSON.stringify(report).includes('never-publish-this'), false);
 assert.equal(report.groups.find(group => group.id === 'browser-pixel').cases.every(check => check.status === 'not_run'), true);
 const stale = renderReport(records, { [suite.id]: 'changed' }).groups.find(group => group.id === suite.id);
 assert.equal(stale.stale, true); assert.equal(stale.cases.every(check => check.status === 'not_run'), true);
 const receipt = sanitizeReceipt(suite, records[suite.id], 'current');
 assert.equal(JSON.stringify(receipt).includes('never-publish-this'), false);
 assert.equal(sanitizeReceipt(suite, records[suite.id], 'changed'), null);
 const deployed = renderReport({[suite.id]:receipt}, {[suite.id]:'current'});
 assert.equal(deployed.groups.find(group => group.id === suite.id).cases[0].status, 'passed');
 assert.equal(aggregateStatus(['skipped','pending','todo']), 'not_run');
 assert.equal(aggregateStatus(['passed','failed']), 'failed');
 assert.equal(aggregateStatus(['passed','skipped']), 'passed');
});

test('structured reporter distinguishes real failures and skips without copying console logs or errors', () => {
 const directory = mkdtempSync(resolve(tmpdir(), 'orgportal-test-reporter-'));
 try {
  const path = resolve(directory, 'fixture.test.mjs');
  writeFileSync(path, `import test from 'node:test';
test('passes',()=>console.log('never-publish-this'));
test('fails',()=>{throw Error('never-publish-this')});
test.skip('skips',()=>{});
test.todo('todo');`);
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=' + resolve(root, 'scripts/test-status-reporter.mjs'), path], { encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
  assert.equal(result.status, 1);
  const outcomes = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(outcomes.map(row => [row.name, row.status]), [['passes', 'passed'], ['fails', 'failed'], ['skips', 'not_run'], ['todo', 'not_run']]);
  assert.equal(result.stdout.includes('never-publish-this'), false);
 } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('catalog spans the portal and keeps submission and voting together', () => {
 assert.equal(catalog.title, 'OrgPortal tests');
 assert.ok(catalog.groups.length > 200);
 assert.ok(new Set(catalog.groups.map(group => group.category)).size >= 10);
 for (const id of ['applications-api', 'attachments-api', 'browser-desktop', 'browser-pixel']) assert.equal(catalog.groups.find(group => group.id === id).category, 'Submission and voting');
 assert.equal(new Set(catalog.groups.map(group => group.id)).size, catalog.groups.length);
});
