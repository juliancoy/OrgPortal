import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { databaseCostMetrics, measuredDatabase } from '../src/databaseCost';

function fixture() {
  let calls = 0;
  const statement = {
    bind(..._args: unknown[]) { return this; },
    async all() { calls++; return { results: [{ n: 4 }], success: true, meta: { rows_read: 10, rows_written: 0 } }; },
    async run() { calls++; return { results: [], success: true, meta: { rows_read: 0, rows_written: 2 } }; },
  };
  const database = {
    prepare(_sql: string) { return statement; },
    async batch(statements: typeof statement[]) { return Promise.all(statements.map(s => s.run())); },
  } as unknown as D1Database;
  return { database, calls: () => calls };
}
test('counts bound reads, first values and batch writes without reexecuting SQL', async () => {
  const f = fixture(); const { db, cost } = measuredDatabase(f.database);
  assert.deepEqual(await db.prepare('SELECT private').bind('private-user').first(), { n: 4 });
  assert.equal(await db.prepare('SELECT private').first('n'), 4);
  await db.prepare('SELECT private').all();
  await db.batch([db.prepare('INSERT private').bind('private-value')]);
  assert.equal(f.calls(), 4);
  assert.equal(cost.queries, 4); assert.equal(cost.rows_read, 30); assert.equal(cost.rows_written, 2);
  assert.equal(cost.unmeasured_queries, 0);
  assert.equal(JSON.stringify(cost).includes('private'), false);
});
test('request metrics do not replace the shared binding and include safe timing metadata', async () => {
  const f = fixture(); const env = { DB: f.database };
  const app = new Hono<{ Bindings: typeof env }>();
  app.use('/summary', databaseCostMetrics(() => false));
  app.get('/summary', async c => c.json(await c.env.DB.prepare('SELECT private').first()));
  const responses = await Promise.all([app.request('https://local/summary', {}, env),app.request('https://local/summary', {}, env)]);
  assert.equal(env.DB, f.database);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.match(response.headers.get('server-timing')!, /queries=1 rows_read=10 rows_written=0/);
    assert.deepEqual(await response.json(), { n: 4 });
  }
});
test('denied requests keep their status and logs contain only aggregate costs', async () => {
  const f = fixture(); const logs: string[] = []; const original = console.info;
  console.info = (line: string) => { logs.push(line); };
  try {
    const app = new Hono<{ Bindings: { DB: D1Database } }>();
    app.use('/summary', databaseCostMetrics(() => true));
    app.get('/summary', c => c.json({ error: 'Unauthorized' }, 401));
    const response = await app.request('https://local/summary?email=private@example.test', { headers: { authorization: 'private-token' } }, { DB: f.database });
    assert.equal(response.status, 401);assert.equal(f.calls(), 0);
    assert.equal(logs.length, 1);assert.equal(logs[0].includes('private'), false);
    assert.equal(JSON.parse(logs[0]).route, '/summary');
  } finally { console.info = original; }
});
test('empty first results and unavailable metadata remain distinguishable from measured zero', async () => {
  const statement = { async all() { return { results: [], success: true }; } };
  const { db, cost } = measuredDatabase({ prepare() { return statement; } } as unknown as D1Database);
  assert.equal(await db.prepare('SELECT empty').first(), null);
  assert.equal(cost.queries, 1); assert.equal(cost.unmeasured_queries, 1);
});
test('database failures propagate and count as unmeasured operations', async () => {
  const failure = new Error('database unavailable');
  const statement = { async all() { throw failure; } };
  const { db, cost } = measuredDatabase({ prepare() { return statement; } } as unknown as D1Database);
  await assert.rejects(db.prepare('SELECT failed').first(), failure);
  assert.equal(cost.queries, 1); assert.equal(cost.unmeasured_queries, 1);
});
