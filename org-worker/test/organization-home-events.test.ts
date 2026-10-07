import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/index';
import { EventTestDb } from './event-test-db';

test('homepage feed includes ongoing hosted events and excludes related and finished events', async t => {
  const db = new EventTestDb();
  t.after(() => db.close());
  await db.prepare("INSERT INTO organizations (id, name, slug) VALUES ('life', 'LifeTech', 'lifetech')").run();
  const now = Date.now();
  for (const [id, host, start, end] of [
    ['ongoing', 'life', -3600000, 3600000],
    ['future', 'life', 7200000, 10800000],
    ['finished', 'life', -7200000, -3600000],
    ['related', 'org-one', 1800000, 3600000],
  ] as const) {
    await db.prepare(`INSERT INTO events (id, ingest_key, title, slug, starts_at, ends_at, host_org_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, id, id, id, new Date(now + start).toISOString(), new Date(now + end).toISOString(), host, new Date(now).toISOString(), new Date(now).toISOString()).run();
  }
  await db.prepare("INSERT INTO event_organizations VALUES ('related', 'life')").run();
  const env = { DB: db } as unknown as Env;
  const events = async (query: string) => {
    const response = await app.request(`https://lifetech.fyi/api/network/orgs/public/lifetech/events?upcoming_only=true${query}`, {}, env);
    assert.equal(response.status, 200);
    return (await response.json() as { id: string }[]).map(event => event.id);
  };
  assert.deepEqual(await events('&hosted_only=true&limit=1'), ['ongoing']);
  assert.deepEqual(await events('&hosted_only=true'), ['ongoing', 'future']);
  assert.deepEqual(await events(''), ['ongoing', 'related', 'future']);
});
