import assert from 'node:assert/strict';
import test from 'node:test';
import { EventTestDb } from './event-test-db';
import { provisionEventChat, provisionPendingEventChats } from '../src/eventChat';
import { ensureEventRoom } from '../../chat-worker/src/organizationRooms';

test('event rooms are created once, reused, and linked after a failed attempt', async () => {
  const db = new EventTestDb();
  try {
    await db.prepare(`CREATE TABLE organization_ownerships (organization_id TEXT, owner_user_id TEXT, status TEXT)`).run();
    await db.prepare("INSERT INTO organization_ownerships VALUES('org-one','alice','active')").run();
    await db.prepare(`CREATE TABLE chat_conversations (
      id TEXT PRIMARY KEY, kind TEXT, title TEXT, slug TEXT, created_by_user_id TEXT,
      org_id TEXT, event_id TEXT, created_at TEXT, updated_at TEXT)`).run();
    await db.prepare(`INSERT INTO events (id, ingest_key, title, slug, host_org_id, created_at, updated_at)
      VALUES ('event-one', 'test:event', 'LifeTech Social', 'lifetech-social', 'org-one', '2026-10-06', '2026-10-06')`).run();
    let fail = true;
    let calls = 0;
    const env = { DB: db, CHAT_ORGANIZATION_ROOMS: {
      async ensureEvent(eventId: string) {
        calls++;
        if (fail) throw new Error('Temporary outage');
        return ensureEventRoom({ DB: db as unknown as D1Database, CONTACTS_DB: db as unknown as D1Database }, eventId);
      },
    } } as unknown as Env;
    assert.equal(await provisionEventChat(env, 'event-one'), false);
    fail = false;
    await provisionPendingEventChats(env);
    const linked = await db.prepare('SELECT event_chat_room_id FROM events WHERE id = ?').bind('event-one').first();
    assert.equal(linked.event_chat_room_id, 'event-room-event-one');
    await provisionEventChat(env, 'event-one');
    assert.equal(calls, 2);
    await ensureEventRoom({ DB: db as unknown as D1Database, CONTACTS_DB: db as unknown as D1Database }, 'event-one');
    const rooms = await db.prepare('SELECT * FROM chat_conversations').all();
    assert.equal(rooms.results.length, 1);
    assert.equal(rooms.results[0].org_id, 'org-one');
    assert.equal(rooms.results[0].title, 'LifeTech Social comments');
    await assert.rejects(ensureEventRoom({ DB: db as unknown as D1Database, CONTACTS_DB: db as unknown as D1Database }, 'missing'), /Event not found/);
  } finally { db.close(); }
});

test('imported events wait for a human claim and cannot starve eligible event retries', async () => {
  const db = new EventTestDb();
  try {
    await db.prepare('CREATE TABLE organization_ownerships (organization_id TEXT, owner_user_id TEXT, status TEXT)').run();
    await db.prepare(`CREATE TABLE chat_conversations (id TEXT PRIMARY KEY, kind TEXT, title TEXT, slug TEXT,
      created_by_user_id TEXT, org_id TEXT, event_id TEXT, created_at TEXT, updated_at TEXT)`).run();
    await db.prepare("INSERT INTO organizations(id,name,slug) VALUES('imported','Imported group','imported')").run();
    await db.prepare(`INSERT INTO events(id,ingest_key,title,slug,host_org_id,created_at,updated_at)
      VALUES('imported-event','test:imported','Imported event','imported-event','imported','2026-10-07','2026-10-07')`).run();
    // The imported records would exhaust the cron's 50-row limit without filtering.
    for (let index = 0; index < 55; index++) {
      await db.prepare(`INSERT INTO events(id,ingest_key,title,slug,host_org_id,created_at,updated_at)
        VALUES(?,?,'Imported event',?,'imported','2026-10-07','2026-10-07')`)
        .bind(`seed-${index}`, `test:seed-${index}`, `seed-${index}`).run();
    }
    await db.prepare(`INSERT INTO events(id,ingest_key,title,slug,host_user_id,created_at,updated_at)
      VALUES('personal','test:personal','Personal event','personal','alice','2026-10-01','2026-10-01')`).run();
    const calls: string[] = [];
    const env = { DB: db, CHAT_ORGANIZATION_ROOMS: { async ensureEvent(id: string) {
      calls.push(id); return { id: `room-${id}` };
    } } } as unknown as Env;
    assert.equal(await provisionEventChat(env, 'imported-event'), false);
    await assert.rejects(ensureEventRoom({ DB: db as unknown as D1Database, CONTACTS_DB: db as unknown as D1Database }, 'imported-event'), /Claim the host organization/);
    assert.equal((await db.prepare('SELECT * FROM chat_conversations').all()).results.length, 0);
    await provisionPendingEventChats(env);
    assert.deepEqual(calls, ['personal']);
    await db.prepare("INSERT INTO organization_ownerships VALUES('imported','alice','active')").run();
    assert.equal(await provisionEventChat(env, 'imported-event'), true);
    assert.deepEqual(calls, ['personal', 'imported-event']);
  } finally { db.close(); }
});

test('replicas never provision production chat rooms', async () => {
  const env = { ORGANIZATION_REPLICA_SOURCE: 'https://lifetech.fyi/api/org', CHAT_ORGANIZATION_ROOMS: {
    async ensureEvent() { throw new Error('Must not call production service'); },
  } } as unknown as Env;
  assert.equal(await provisionEventChat(env, 'event-one'), false);
  await provisionPendingEventChats(env);
});
