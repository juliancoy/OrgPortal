import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/index';
import { EventTestDb } from './event-test-db';
import { identityProfile } from './helpers/identityProfile';

test('event editor checks live management permission and persists details without changing the public link', async t => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const id = new Headers(options.headers).get('Authorization')?.replace('Bearer ', '');
    return Response.json(identityProfile({ id }));
  });
  const db = new EventTestDb();
  t.after(() => db.close());
  await db.prepare("INSERT INTO events(id,ingest_key,title,slug,host_org_id,created_at,updated_at) VALUES('hut','hut','Old title','medtech-in-the-hut-2026-10-20','org-one','','')").run();
  const env = { DB: db, PIDP_BASE_URL: 'https://identity.test' } as unknown as Env;
  const request = (user?: string, body?: object, path = '') => app.request(`https://org.test/api/network/events/hut${path}`, {
    method: body ? 'PATCH' : 'GET', headers: { ...(user ? { Authorization: `Bearer ${user}` } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }, env);
  assert.equal((await request(undefined, undefined, '/access')).status, 401);
  assert.equal((await request('other', undefined, '/access')).status, 403);
  assert.equal((await request('other', { title: 'Unauthorized' })).status, 403);
  assert.deepEqual(await (await request('pidp-user', undefined, '/access')).json(), { can_manage: true });
  const details = { title: 'MedTech in the Hut', image_url: 'https://medtech.social/photo.png', description: 'Updated gathering', location: 'Baltimore', event_date: '2026-10-20', timezone: 'America/New_York', starts_at: '2026-10-20T18:00:00-04:00', ends_at: '2026-10-20T20:00:00-04:00' };
  const saved = await request('pidp-user', details);
  assert.equal(saved.status, 200);
  const event = await saved.json() as typeof details & { slug: string };
  assert.equal(event.title, details.title); assert.equal(event.image_url, details.image_url);
  assert.equal(event.starts_at, '2026-10-20T22:00:00.000Z');
  assert.equal(event.ends_at, '2026-10-21T00:00:00.000Z');
  assert.equal(event.slug, 'medtech-in-the-hut-2026-10-20');
  for (const invalid of [{ title: ' ' }, { starts_at: 'nonsense' }, { ends_at: '2026-10-19T00:00:00Z' }, { event_date: '2026-02-30' }, { timezone: 'Invalid/Zone' }, { image_url: 'javascript:alert(1)' }]) {
    assert.equal((await request('pidp-user', invalid)).status, 400, JSON.stringify(invalid));
  }
  assert.equal((await db.prepare('SELECT title FROM events WHERE id=?').bind('hut').first()).title, details.title);
  await db.prepare("UPDATE organization_memberships SET status='inactive'").run();
  assert.equal((await request('pidp-user', undefined, '/access')).status, 403);
  assert.equal((await request('pidp-user', { title: 'Revoked' })).status, 403);
});

test('individual hosts can edit their own event and another account cannot', async t => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => Response.json(identityProfile({ id: new Headers(options.headers).get('Authorization')?.replace('Bearer ', '') })));
  const db = new EventTestDb(); t.after(() => db.close());
  await db.prepare("INSERT INTO events(id,ingest_key,title,slug,host_user_id,created_at,updated_at) VALUES('own','own','Individual event','own','alice','','')").run();
  const env = { DB: db, PIDP_BASE_URL: 'https://identity.test' } as unknown as Env;
  for (const [id, expected] of [['alice', 200], ['bob', 403]] as const) {
    assert.equal((await app.request('https://org.test/api/network/events/own', { method: 'PATCH', headers: { Authorization: `Bearer ${id}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Edited' }) }, env)).status, expected);
  }
});
