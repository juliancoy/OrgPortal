import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/index';
import { EventTestDb } from './event-test-db';

test('signed-out event visitors receive comments through the internal chat service', async t => {
  const db = new EventTestDb();
  t.after(() => db.close());
  await db.prepare(`INSERT INTO events(id,ingest_key,title,slug,host_org_id,event_chat_room_id,created_at,updated_at)
    VALUES('pitch','pitch','Pitch','pitch','org-one','event-room-pitch','','')`).run();
  const messages = [{ id: 'comment-one', body: 'Looking forward to this event!', sender_name: 'Public attendee', sequence: 1 }];
  t.mock.method(globalThis, 'fetch', async () => new Response('Public Worker route unavailable', { status: 403 }));
  let calls = 0;
  const env = { DB: db, CHAT_API_ORIGIN: 'https://chat.example', CHAT_SERVICE: {
    async fetch(request: Request) {
      calls++;
      assert.equal(request.url, 'https://chat.example/api/network/public/event-chat/event-room-pitch/messages?limit=100');
      assert.equal(request.headers.has('authorization'), false);
      return Response.json({ messages });
    },
  } } as unknown as Env;
  const response = await app.request('https://org.test/api/network/events/public/pitch/chat', {}, env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { messages: unknown[] }).messages, messages);
  assert.equal(calls, 1);
});
