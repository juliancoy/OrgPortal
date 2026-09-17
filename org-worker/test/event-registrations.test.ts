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
    '0037_event_registrant_contact_data',
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
  assert.deepEqual(await cancelled.json(), {
    event_id: 'event-1',
    count: 1,
    attendees: [{ user_id: 'bob', slug: 'bob', name: 'User', photo_url: null, profile_public: false }],
    registered: false,
  });
  const bobContact = database.prepare("SELECT user_email, user_name, slug, enabled FROM user_contact_pages WHERE user_id = 'bob'").get();
  assert.equal(bobContact?.user_email, null);
  assert.equal(bobContact?.user_name, 'User');
  assert.equal(bobContact?.slug, 'bob');
  assert.equal(bobContact?.enabled, 0);
  await request('DELETE', 'alice');
  assert.equal((await (await request('GET', 'bob')).json()).registered, true);
  assert.equal((await (await request('GET', 'alice', 'event-2')).json()).registered, true);
  assert.equal((await (await request('POST', 'alice')).json()).count, 2);
  for (const method of ['GET', 'POST', 'DELETE']) assert.equal((await request(method, 'alice', 'missing')).status, 404);
  database.exec("DELETE FROM events WHERE id = 'event-1'");
  assert.equal(database.prepare("SELECT count(*) AS n FROM event_registrations WHERE event_id = 'event-1'").get()?.n, 0);
});

test('registration refreshes placeholder contact rows with the real name and avatar', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const token = new Headers(options.headers).get('Authorization')?.replace('Bearer ', '');
    return token === 'bob'
      ? Response.json({
        id: 'bob',
        email: 'bob@example.test',
        full_name: 'Bob Builder',
        identity_data: { avatar_url: 'https://images.test/bob.png' },
      })
      : new Response('', { status: 401 });
  });
  const { database, request } = setup();
  t.after(() => database.close());
  database.exec("INSERT INTO event_registrations (event_id, user_id) VALUES ('event-1', 'bob')");
  database.exec(`INSERT INTO user_contact_pages
    (id, user_id, user_email, user_name, slug, enabled, photo_url, links)
    VALUES ('event-registrant-bob', 'bob', NULL, 'User', 'event-registrant-bob-1', 0, NULL, '[]')`);

  const refreshed = await request('POST', 'bob');
  assert.equal(refreshed.status, 200);
  assert.deepEqual(await refreshed.json(), {
    event_id: 'event-1',
    count: 1,
    attendees: [{
      user_id: 'bob',
      slug: 'bob-builder',
      name: 'Bob Builder',
      photo_url: 'https://images.test/bob.png',
      profile_public: false,
    }],
    registered: true,
  });
  const bobContact = database.prepare("SELECT user_name, slug, photo_url, enabled FROM user_contact_pages WHERE user_id = 'bob'").get();
  assert.equal(bobContact?.user_name, 'Bob Builder');
  assert.equal(bobContact?.slug, 'bob-builder');
  assert.equal(bobContact?.photo_url, 'https://images.test/bob.png');
  assert.equal(bobContact?.enabled, 0);
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

test('public preview counts all registrations and returns registrant profiles without private fields', async (t) => {
  const { database, request } = setup();
  t.after(() => database.close());
  for (let i = 0; i < 12; i++) {
    database.prepare(`INSERT INTO user_contact_pages
      (id, user_id, user_email, user_name, slug, enabled, photo_url, phone_public)
      VALUES (?, ?, 'private@example.test', ?, ?, ?, ?, '555-0100')`)
      .run(`p-${i}`, `u-${i}`, `Person ${i}`, `person-${i}`, i === 0 ? 0 : 1, 'https://images.test/avatar.png');
    database.prepare('INSERT INTO event_registrations (event_id, user_id) VALUES (?, ?)').run('event-1', `u-${i}`);
  }
  const response = await request();
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(data.count, 12);
  assert.equal(data.attendees.length, 12);
  const privateProfile = data.attendees.find((person: { slug: string }) => person.slug === 'person-0');
  assert.equal(privateProfile.user_id, 'u-0');
  assert.equal(privateProfile.name, 'Person 0');
  assert.equal(privateProfile.photo_url, 'https://images.test/avatar.png');
  assert.equal(privateProfile.profile_public, false);
  const publicProfile = data.attendees.find((person: { slug: string }) => person.slug === 'person-1');
  assert.equal(publicProfile.name, 'Person 1');
  assert.equal(publicProfile.photo_url, 'https://images.test/avatar.png');
  assert.equal(publicProfile.profile_public, true);
  for (const person of data.attendees) assert.deepEqual(Object.keys(person).sort(), ['name', 'photo_url', 'profile_public', 'slug', 'user_id']);
  assert.doesNotMatch(JSON.stringify(data), /private@|email@|555-0100/);
});

test('event registrant data migration repairs contact rows used for messaging', async (t) => {
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  database.exec('PRAGMA foreign_keys = ON');
  for (const name of [
    '0001_contact_pages',
    '0002_org_event_directories',
    '0018_event_registrations',
  ]) {
    database.exec(readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
  }
  database.exec("INSERT INTO events (id, ingest_key, title, slug) VALUES ('event-1', 'one', 'First event', 'first-event')");
  database.exec("INSERT INTO event_registrations (event_id, user_id) VALUES ('event-1', 'missing-contact'), ('event-1', 'dirty-contact')");
  database.exec(`INSERT INTO user_contact_pages
    (id, user_id, user_email, user_name, slug, enabled, photo_url)
    VALUES ('dirty-page', 'dirty-contact', 'dirty@example.test', 'dirty@example.test', '', 0, 'javascript:alert(1)')`);

  database.exec(readFileSync(new URL('../migrations/0037_event_registrant_contact_data.sql', import.meta.url), 'utf8'));

  const missingContact = database.prepare("SELECT user_name, slug, enabled FROM user_contact_pages WHERE user_id = 'missing-contact'").get();
  assert.equal(missingContact?.user_name, 'User');
  assert.match(String(missingContact?.slug), /^event-registrant-missing-contact-\d+$/);
  assert.equal(missingContact?.enabled, 0);
  const dirtyContact = database.prepare("SELECT user_name, slug, photo_url FROM user_contact_pages WHERE user_id = 'dirty-contact'").get();
  assert.equal(dirtyContact?.user_name, 'User');
  assert.match(String(dirtyContact?.slug), /^event-registrant-dirty-contact-\d+$/);
  assert.equal(dirtyContact?.photo_url, null);
});
