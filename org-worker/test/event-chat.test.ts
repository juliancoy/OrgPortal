import assert from 'node:assert/strict';
import test from 'node:test';
import { EventTestDb } from './event-test-db';
import { provisionEventChat, provisionPendingEventChats } from '../src/eventChat';
import { ensureEventRoom } from '../../chat-worker/src/organizationRooms';

test('event rooms are created once, reused, and linked after a failed attempt', async () => {
  const db = new EventTestDb();
  try {
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

test('replicas never provision production chat rooms', async () => {
  const env = { ORGANIZATION_REPLICA_SOURCE: 'https://lifetech.fyi/api/org', CHAT_ORGANIZATION_ROOMS: {
    async ensureEvent() { throw new Error('Must not call production service'); },
  } } as unknown as Env;
  assert.equal(await provisionEventChat(env, 'event-one'), false);
  await provisionPendingEventChats(env);
});
