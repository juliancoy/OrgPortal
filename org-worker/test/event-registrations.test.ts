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
  for (const name of [
    '0001_contact_pages',
    '0002_org_event_directories',
    '0018_event_registrations',
    '0019_email_campaigns',
    '0025_portal_tenants',
    '0027_portal_tenant_branding',
    '0028_portal_tenant_home_page',
    '0029_portal_tenant_deployment_model',
    '0032_portal_tenant_org_slug',
    '0033_portal_tenant_custom_domains',
    '0034_event_calendar_feeds',
  ]) {
    database.exec(readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
  }
  database.exec("INSERT INTO events (id, ingest_key, title, slug) VALUES ('event-1', 'one', 'First event', 'first-event'), ('event-2', 'two', 'Second event', 'second-event')");
  const env = { DB: { prepare: (sql: string) => new Statement(database.prepare(sql)), batch: async (statements: Statement[]) => {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  } }, PIDP_BASE_URL: 'https://identity.test' } as unknown as Env;
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

test('registered events calendar feed is private, subscribable, and host-rooted', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const token = new Headers(options.headers).get('Authorization')?.replace('Bearer ', '');
    return token ? Response.json({ id: token }) : new Response('', { status: 401 });
  });
  const { database } = setup();
  t.after(() => database.close());
  database.exec("UPDATE events SET starts_at = '2026-09-29T22:00:00.000Z', ends_at = '2026-09-30T00:00:00.000Z', location = 'Checkerspot Brewing' WHERE id = 'event-1'");
  database.exec("UPDATE events SET starts_at = '2026-10-01T22:00:00.000Z', ends_at = '2026-10-02T00:00:00.000Z' WHERE id = 'event-2'");
  database.exec("INSERT INTO event_registrations (event_id, user_id) VALUES ('event-1', 'alice'), ('event-2', 'bob')");

  const metadataResponse = await app.request('https://medtech.social/api/network/calendar/feed', {
    headers: { Authorization: 'Bearer alice' },
  }, { DB: { prepare: (sql: string) => new Statement(database.prepare(sql)), batch: async (statements: Statement[]) => {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  } }, PIDP_BASE_URL: 'https://identity.test' } as unknown as Env);
  assert.equal(metadataResponse.status, 200);
  assert.equal(metadataResponse.headers.get('Cache-Control'), 'no-store');
  const metadata = await metadataResponse.json() as { feed_url: string; webcal_url: string; google_url: string; outlook_url: string; event_count: number };
  assert.match(metadata.feed_url, /^https:\/\/medtech\.social\/api\/org\/api\/network\/calendar\/feed\/[A-Za-z0-9_-]+\.ics$/);
  assert.equal(metadata.webcal_url.startsWith('webcal://medtech.social/'), true);
  assert.equal(metadata.google_url.includes(encodeURIComponent(metadata.feed_url)), true);
  assert.equal(metadata.outlook_url.includes(encodeURIComponent(metadata.feed_url)), true);
  assert.equal(metadata.event_count, 1);

  const icsResponse = await app.request(metadata.feed_url.replace('/api/org', ''), undefined, {
    DB: { prepare: (sql: string) => new Statement(database.prepare(sql)), batch: async (statements: Statement[]) => {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    } },
    PIDP_BASE_URL: 'https://identity.test',
  } as unknown as Env);
  assert.equal(icsResponse.status, 200);
  assert.equal(icsResponse.headers.get('Content-Type'), 'text/calendar;charset=utf-8');
  const ics = await icsResponse.text();
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:First event/);
  assert.match(ics, /URL:https:\/\/medtech\.social\/events\/first-event/);
  assert.doesNotMatch(ics, /Second event/);
  assert.doesNotMatch(ics, /alice|bob/);
});

test('public preview counts all registrations while exposing only public profiles', async (t) => {
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
  assert.equal(data.attendees.length, 11);
  assert.equal(data.attendees.some((person: { slug: string }) => person.slug === 'person-0'), false);
  const emailName = data.attendees.find((person: { slug: string }) => person.slug === 'person-1');
  assert.equal(emailName.name, 'Registrant');
  assert.equal(emailName.photo_url, null);
  for (const person of data.attendees) assert.deepEqual(Object.keys(person).sort(), ['name', 'photo_url', 'slug']);
  assert.doesNotMatch(JSON.stringify(data), /private@|email@|555-0100/);
});
