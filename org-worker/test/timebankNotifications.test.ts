import assert from 'node:assert/strict';
import test from 'node:test';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { createTimebankListing, setTimebankUptake, proposeTimebankExchange, resolveTimebankExchange, getTimebankListing } from '../src/timebank';
import { timebankNotifications, markTimebankNotificationsRead, dispatchTimebankPush } from '../src/timebankNotifications';
import { app } from '../src/index';
import { consumePushBatch, type PushDeliveryJob } from '../src/push';
const alice = { id: 'alice', name: 'Alice' }, bob = { id: 'bob', name: 'Bob' };
const community = 'bmoretimebank';
const input = () => ({ id: crypto.randomUUID(), kind: 'request', title: 'Garden help', description: 'Help with the raised beds.', minutes: 60 });
const proposal = (id: string) => ({ id: crypto.randomUUID(), listing_id: id, minutes: 30, note: 'Finished the garden.' });

test('uptake notifications are scoped, immutable on retry and do not spam after rejoining', async () => {
  const database = new TimebankDatabase(), db = database.asD1();
  const listing = await createTimebankListing(db, alice, input(), community);
  await setTimebankUptake(db, bob, listing.id, true, community);
  const contact = database.sqlite.prepare('SELECT user_name, enabled FROM user_contact_pages WHERE user_id = ?').get(alice.id)!;
  assert.equal(contact.user_name, 'Alice'); assert.equal(contact.enabled, 0);
  const first = await timebankNotifications(db, alice.id, community);
  assert.equal(first.unread_count, 1); assert.equal(first.items[0].actor_user_id, bob.id);
  assert.equal(first.items[0].deep_link, `/timebanking?listing=${listing.id}`);
  assert.equal((await timebankNotifications(db, bob.id, community)).items.length, 0);
  assert.equal((await timebankNotifications(db, alice.id, 'code-collective')).items.length, 0);
  await markTimebankNotificationsRead(db, bob.id, community, { ids: [first.items[0].id] });
  await markTimebankNotificationsRead(db, alice.id, 'code-collective', { ids: [first.items[0].id] });
  assert.equal((await timebankNotifications(db, alice.id, community)).unread_count, 1);
  await markTimebankNotificationsRead(db, alice.id, community, { ids: [first.items[0].id] });
  await setTimebankUptake(db, bob, listing.id, true, community);
  await setTimebankUptake(db, bob, listing.id, false, community);
  await setTimebankUptake(db, bob, listing.id, true, community);
  const last = await timebankNotifications(db, alice.id, community);
  assert.equal(last.items.length, 1); assert.equal(last.unread_count, 0);
  database.sqlite.close();
});

test('exchange lifecycle notifies the correct participant exactly once and retires pending alerts', async () => {
  const database = new TimebankDatabase(), db = database.asD1();
  const listing = await createTimebankListing(db, alice, input(), community);
  for (const state of ['confirmed', 'declined', 'canceled']) {
    const p = proposal(listing.id);
    const row = await proposeTimebankExchange(db, bob, p, community);
    await proposeTimebankExchange(db, bob, p, community);
    assert.equal((await timebankNotifications(db, alice.id, community)).items.filter((n) => n.entity_id === row.id).length, 1);
    await assert.rejects(resolveTimebankExchange(db, 'outsider', row.id, { status: state }, community));
    const actor = state === 'canceled' ? bob.id : alice.id;
    await resolveTimebankExchange(db, actor, row.id, { status: state }, community);
    await resolveTimebankExchange(db, actor, row.id, { status: state }, community);
    const target = state === 'canceled' ? alice.id : bob.id;
    const notices = (await timebankNotifications(db, target, community)).items.filter((n) => n.entity_id === row.id && n.type === `timebank_hours_${state}`);
    assert.equal(notices.length, 1); assert.equal(notices[0].actor_user_id, actor);
    assert.match(notices[0].body, /0.5 hours/);
    const pending = (await timebankNotifications(db, alice.id, community)).items.find((n) => n.id.endsWith(`${row.id}:pending`));
    assert.equal(pending?.status, 'read');
  }
  database.sqlite.close();
});

test('failure to persist a notification rolls back its exchange', async () => {
  const database = new TimebankDatabase(), db = database.asD1();
  const listing = await createTimebankListing(db, alice, input(), community);
  database.sqlite.exec("CREATE TRIGGER reject_notice BEFORE INSERT ON user_notifications BEGIN SELECT RAISE(ABORT, 'inbox failed'); END");
  const p = proposal(listing.id);
  await assert.rejects(proposeTimebankExchange(db, bob, p, community), /inbox failed/);
  assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS n FROM timebank_exchanges WHERE id = ?').get(p.id)!.n, 0);
  database.sqlite.close();
});

test('notification pagination preserves timestamp ties and explicit read IDs avoid new-event races', async () => {
  const database = new TimebankDatabase(), db = database.asD1();
  const add = database.sqlite.prepare("INSERT INTO user_notifications (id,user_id,community_id,type,title,created_at,deep_link) VALUES (?, 'alice', ?, 'timebank_test', 'Test', '2026-09-09T00:00:00.000Z', '/timebanking?tab=activity')");
  for (let i = 0; i < 105; i++) add.run(`test-${String(i).padStart(3,'0')}`, community);
  const seen = []; let cursor: string | undefined;
  do { const page = await timebankNotifications(db, alice.id, community, cursor); seen.push(...page.items.map((n) => n.id)); cursor = page.next_cursor || undefined; } while (cursor);
  assert.equal(seen.length, 105); assert.equal(new Set(seen).size, 105);
  await markTimebankNotificationsRead(db, alice.id, community, { ids: seen.slice(0, 50) });
  assert.equal((await timebankNotifications(db, alice.id, community)).unread_count, 55);
  await assert.rejects(timebankNotifications(db, alice.id, community, 'bad cursor'));
  await assert.rejects(markTimebankNotificationsRead(db, alice.id, community, { ids: Array(101).fill('x') }));
  database.sqlite.close();
});

test('a listing link resolves closed/older listings while enforcing community scope', async () => {
  const database = new TimebankDatabase(), db = database.asD1();
  const listing = await createTimebankListing(db, alice, input(), community);
  await setTimebankUptake(db, bob, listing.id, true, community);
  database.sqlite.prepare("UPDATE timebank_listings SET status='closed' WHERE id=?").run(listing.id);
  const row = await getTimebankListing(db, bob.id, community, listing.id);
  assert.equal(row.status, 'closed'); assert.equal(row.member_name, 'Alice'); assert.equal(row.uptake_count, 1);
  await assert.rejects(getTimebankListing(db, bob.id, 'code-collective', listing.id), { status: 404 });
  database.sqlite.close();
});

test('outbox retries queue failures and emits stable, community-aware push payloads', async () => {
  const database = new TimebankDatabase(), db = database.asD1();
  const listing = await createTimebankListing(db, alice, input(), community);
  await setTimebankUptake(db, bob, listing.id, true, community);
  let attempts = 0; const jobs: unknown[] = [];
  const env = { DB: db, VAPID_PUBLIC_KEY: 'test', VAPID_PRIVATE_KEY: 'test', VAPID_SUBJECT: 'mailto:test@example.test', PUSH_QUEUE: { send: async (job: unknown) => { attempts++; if (attempts === 1) throw new Error('queue unavailable'); jobs.push(job); } } } as unknown as Env;
  await assert.rejects(dispatchTimebankPush(env), /queue unavailable/);
  assert.equal(database.sqlite.prepare('SELECT push_enqueued_at FROM user_notifications').get()!.push_enqueued_at, null);
  await dispatchTimebankPush(env); await dispatchTimebankPush(env);
  assert.equal(attempts, 2); assert.equal(jobs.length, 1);
  const job = jobs[0] as { eventId: string; deepLink: string; data: { communityId: string; notificationId: string } };
  assert.equal(job.deepLink, `https://bmoretimebank.codecollective.us/p/timebanking?listing=${listing.id}`);
  assert.equal(job.data.notificationId, job.eventId); assert.equal(job.data.communityId, community);
  database.sqlite.close();
});

test('inbox requires authentication and listing links reject cross-community reads', async (t) => {
  const database = new TimebankDatabase();t.after(() => database.sqlite.close());
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init: RequestInit) => Response.json({ id: new Headers(init.headers).get('Authorization')?.replace('Bearer ', ''), full_name: 'Alice' }));
  const env = { DB: database.asD1(), PIDP_BASE_URL: 'https://identity.example.test' };
  const listing = await createTimebankListing(database.asD1(), alice, input(), community);
  const base = 'https://bmoretimebank.codecollective.us/api/timebank';
  for (const [path, method] of [['/notifications', 'GET'], ['/notifications/read', 'POST']]) {
    assert.equal((await app.request(base + path, { method }, env)).status, 401);
  }
  assert.equal((await app.request(`${base}/listings/${listing.id}`, {}, env)).status, 200);
  const response = await app.request(base+'/notifications', { headers: { Authorization: 'Bearer alice' } }, env);
  assert.equal(response.status, 200);assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await app.request(`https://codecollective.us/api/timebank/listings/${listing.id}`, { headers: { Authorization: 'Bearer alice' } }, env)).status, 404);
});

test('a queued alert is suppressed after it is read or resolved', async () => {
  const database = new TimebankDatabase(), db = database.asD1();
  const listing = await createTimebankListing(db, alice, input(), community);
  await setTimebankUptake(db, bob, listing.id, true, community);
  const notice = (await timebankNotifications(db, alice.id, community)).items[0];
  await markTimebankNotificationsRead(db, alice.id, community, { ids: [notice.id] });
  let acknowledged = false;
  const message = { body: { eventId: notice.id, userId: alice.id, title: notice.title, body: notice.body, deepLink: notice.deep_link, data: { notificationId: notice.id, communityId: community, type: notice.type, path: notice.deep_link } }, ack: () => { acknowledged = true; }, retry: () => assert.fail('Read events must not retry') };
  await consumePushBatch({ messages: [message] } as unknown as MessageBatch<PushDeliveryJob>, { DB: db } as Env);
  assert.equal(acknowledged, true);
  database.sqlite.close();
});
