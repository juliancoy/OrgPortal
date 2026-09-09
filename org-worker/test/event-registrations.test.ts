import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import { app } from '../src/index';

class Statement {
  constructor(private statement: StatementSync, private params: unknown[] = []) {}
  bind(...params: unknown[]) { return new Statement(this.statement, params); }
  async first() { return this.statement.get(...this.params) || null; }
  async all() { return { results: this.statement.all(...this.params) }; }
  async run() { return this.statement.run(...this.params); }
}

function setup() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  for (const name of ['0001_contact_pages', '0002_org_event_directories', '0018_event_registrations']) {
    database.exec(readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
  }
  database.exec("INSERT INTO events (id, ingest_key, title, slug) VALUES ('event-1', 'one', 'First event', 'first-event'), ('event-2', 'two', 'Second event', 'second-event')");
  const env = { DB: { prepare: (sql: string) => new Statement(database.prepare(sql)) }, PIDP_BASE_URL: 'https://identity.test' } as unknown as Env;
  const request = (method = 'GET', user?: string, eventId = 'event-1', body?: string) => app.request(
    `https://org.test/api/network/events/${eventId}/attendance`,
    { method, headers: user ? { Authorization: `Bearer ${user}` } : {}, body }, env,
  );
  return { database, request };
}

test('registration requires verified identity; repeated requests and cancellation are scoped to the account', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const token = new Headers(options.headers).get('Authorization')?.replace('Bearer ', '');
    return token === 'invalid' ? new Response('', { status: 401 }) : Response.json({ id: token });
  });
  const { database, request } = setup();
  t.after(() => database.close());
  for (const method of ['POST', 'DELETE']) {
    assert.equal((await request(method)).status, 401);
    assert.equal((await request(method, 'invalid')).status, 401);
  }
  assert.deepEqual(await (await request()).json(), { event_id: 'event-1', count: 0, attendees: [], registered: false });
  // Payload identity cannot register someone else.
  const created = await request('POST', 'alice', 'event-1', JSON.stringify({ user_id: 'bob' }));
  assert.equal(created.status, 200);
  assert.equal((await created.json()).registered, true);
  await Promise.all([request('POST', 'alice'), request('POST', 'alice')]);
  assert.equal((await (await request('GET', 'alice')).json()).count, 1);
  assert.equal((await (await request('GET', 'bob')).json()).registered, false);
  await request('POST', 'bob');
  await request('POST', 'alice', 'event-2');
  assert.equal((await (await request()).json()).count, 2);
  assert.equal((await (await request()).json()).registered, false);
  const cancelled = await request('DELETE', 'alice');
  assert.equal(cancelled.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await cancelled.json(), { event_id: 'event-1', count: 1, attendees: [], registered: false });
  await request('DELETE', 'alice');
  assert.equal((await (await request('GET', 'bob')).json()).registered, true);
  assert.equal((await (await request('GET', 'alice', 'event-2')).json()).registered, true);
  assert.equal((await (await request('POST', 'alice')).json()).count, 2);
  for (const method of ['GET', 'POST', 'DELETE']) assert.equal((await request(method, 'alice', 'missing')).status, 404);
  database.exec("DELETE FROM events WHERE id = 'event-1'");
  assert.equal(database.prepare("SELECT count(*) AS n FROM event_registrations WHERE event_id = 'event-1'").get()?.n, 0);
});

test('public preview counts all registrations but returns at most eight public profiles without private fields', async (t) => {
  const { database, request } = setup();
  t.after(() => database.close());
  for (let i = 0; i < 12; i++) {
    database.prepare(`INSERT INTO user_contact_pages
      (id, user_id, user_email, user_name, slug, enabled, photo_url, phone_public)
      VALUES (?, ?, 'private@example.test', ?, ?, ?, ?, '555-0100')`)
      .run(`p-${i}`, `u-${i}`, i === 1 ? 'email@example.test' : `Person ${i}`, `person-${i}`, i === 0 ? 0 : 1,
        i === 1 ? 'javascript:alert(1)' : 'https://images.test/avatar.png');
    database.prepare('INSERT INTO event_registrations (event_id, user_id) VALUES (?, ?)').run('event-1', `u-${i}`);
  }
  const response = await request();
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(data.count, 12);
  assert.equal(data.attendees.length, 8);
  assert.equal(data.attendees.some((person: { slug: string }) => person.slug === 'person-0'), false);
  const emailName = data.attendees.find((person: { slug: string }) => person.slug === 'person-1');
  assert.equal(emailName.name, 'Registrant');
  assert.equal(emailName.photo_url, null);
  for (const person of data.attendees) assert.deepEqual(Object.keys(person).sort(), ['name', 'photo_url', 'slug']);
  assert.doesNotMatch(JSON.stringify(data), /private@|email@|555-0100/);
});
