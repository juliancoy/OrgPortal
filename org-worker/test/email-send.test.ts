import assert from 'node:assert/strict';
import test from 'node:test';
import { sendGmail } from '../src/emailGoogle';
for (const header of ['7200', new Date(Date.now() + 7_200_000).toUTCString(), 'invalid', '-1']) {
  test(`Gmail rate limits respect Retry-After: ${header}`, async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response('', {status:429,headers:{'Retry-After':header}}));
    const result = await sendGmail('synthetic-token', 'synthetic-message');
    assert.equal(result.status, 'retry');
    assert.ok(result.retryAfterMs! >= 3_600_000);
    if (header === '7200' || header.endsWith('GMT')) assert.ok(result.retryAfterMs! >= 7_190_000);
  });
}
test('ambiguous Gmail acceptance never becomes an automatic retry', async t => {
  for (const response of [new Response('', {status:503}), Response.json({}), new Response('invalid-json', {status:200})]) {
    t.mock.method(globalThis, 'fetch', async () => response);
    assert.equal((await sendGmail('synthetic-token','synthetic-message')).status, 'uncertain');
  }
});
