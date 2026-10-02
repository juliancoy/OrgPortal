import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/index';
import { EventTestDb } from './event-test-db';

test('shared past events and sourced attendance appear in both organizations without duplicating events', async (t) => {
  const db = new EventTestDb();
  t.after(() => db.close());
  await db.prepare("INSERT INTO organizations (id, name, slug) VALUES ('life', 'LifeTech', 'lifetech')").run();
  await db.prepare(`INSERT INTO events (id, ingest_key, title, slug, starts_at, ends_at, host_org_id, created_at, updated_at, attendance_count, attendance_source_url)
    VALUES ('hut', 'hut', 'MedTech in the Hut', 'medtech-in-the-hut', '2026-09-29T22:00:00Z', '2026-09-30T00:30:00Z', 'org-one', '2026-09-01', '2026-09-01', 76, 'https://luma.com/csd7fvgm')`).run();
  await db.prepare("INSERT INTO event_organizations VALUES ('hut', 'life'), ('hut', 'org-one')").run();
  const env = { DB: db } as unknown as Env;
  for (const slug of ['one', 'lifetech']) {
    const response = await app.request(`https://org.test/api/network/orgs/public/${slug}/events?upcoming_only=false`, {}, env);
    assert.equal(response.status, 200);
    const events = await response.json() as { id: string; attendance_count: number; attendance_source_url: string }[];
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'hut');
    assert.equal(events[0].attendance_count, 76);
    assert.equal(events[0].attendance_source_url, 'https://luma.com/csd7fvgm');
    const upcoming = await app.request(`https://org.test/api/network/orgs/public/${slug}/events?upcoming_only=true`, {}, env);
    assert.deepEqual(await upcoming.json(), []);
  }
});
