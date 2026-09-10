import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/index';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { createTimebankListing, proposeTimebankExchange, resolveTimebankExchange, updateTimebankListing, timebankDashboard } from '../src/timebank';

const alice = { id: 'alice', name: 'Alice' };
const bob = { id: 'bob', name: 'Bob' };
const carol = { id: 'carol', name: 'Carol' };
const listingInput = (kind = 'offer') => ({ id: crypto.randomUUID(), kind, title: 'Garden help', description: 'Help with planting. Arrange in the community chat.', location: 'Baltimore', minutes: 90 });
const exchangeInput = (listingId: string) => ({ id: crypto.randomUUID(), listing_id: listingId, minutes: 75, note: 'Planted the raised beds.' });

for (const kind of ['offer', 'request']) {
  test(`${kind}: confirmation moves equal hours between members and leaves Dena untouched`, async () => {
    const database = new TimebankDatabase();
    const db = database.asD1();
    const denaBefore = database.sqlite.prepare('SELECT * FROM ledger_accounts ORDER BY id').all();
    const denaTransactions = database.sqlite.prepare('SELECT * FROM ledger_transactions ORDER BY id').all();
    const listing = await createTimebankListing(db, alice, listingInput(kind));
    const input = exchangeInput(listing.id);
    const exchange = await proposeTimebankExchange(db, bob, input);
    assert.equal((await timebankDashboard(db, alice)).account.balance_minutes, 0);
    assert.equal((await timebankDashboard(db, bob)).account.balance_minutes, 0);
    assert.equal((await timebankDashboard(db, carol)).exchanges.length, 0);
    assert.equal((await proposeTimebankExchange(db, bob, input)).id, exchange.id);
    await assert.rejects(resolveTimebankExchange(db, bob.id, exchange.id, { status: 'confirmed' }), { status: 403 });
    await assert.rejects(resolveTimebankExchange(db, carol.id, exchange.id, { status: 'confirmed' }), { status: 404 });
    await resolveTimebankExchange(db, alice.id, exchange.id, { status: 'confirmed' });
    await resolveTimebankExchange(db, alice.id, exchange.id, { status: 'confirmed' });
    const provider = kind === 'offer' ? alice : bob;
    const recipient = kind === 'offer' ? bob : alice;
    const providerAccount = (await timebankDashboard(db, provider)).account;
    const recipientAccount = (await timebankDashboard(db, recipient)).account;
    assert.equal(providerAccount.balance_minutes, 75);
    assert.equal(providerAccount.earned_minutes, 75);
    assert.equal(recipientAccount.balance_minutes, -75);
    assert.equal(recipientAccount.spent_minutes, 75);
    assert.equal((await timebankDashboard(db, alice)).exchanges.length, 1);
    await assert.rejects(resolveTimebankExchange(db, alice.id, exchange.id, { status: 'declined' }), { status: 409 });
    await assert.rejects(resolveTimebankExchange(db, bob.id, exchange.id, { status: 'canceled' }), { status: 409 });
    assert.deepEqual(database.sqlite.prepare('SELECT * FROM ledger_accounts ORDER BY id').all(), denaBefore);
    assert.deepEqual(database.sqlite.prepare('SELECT * FROM ledger_transactions ORDER BY id').all(), denaTransactions);
    database.sqlite.close();
  });
}

test('listings enforce ownership, availability, input validation and retry identity', async () => {
  const database = new TimebankDatabase();
  const db = database.asD1();
  for (const invalid of [null, [], { ...listingInput(), kind: 'sale' }, { ...listingInput(), title: ' ' }, { ...listingInput(), description: 'x'.repeat(2001) }]) {
    await assert.rejects(createTimebankListing(db, alice, invalid), { status: 400 });
  }
  for (const minutes of [0, -15, 1, 16, 15.5, 1441, NaN, Infinity, '60', true, null]) {
    await assert.rejects(createTimebankListing(db, alice, { ...listingInput(), minutes }), { status: 400 });
  }
  const input = listingInput();
  const listing = await createTimebankListing(db, alice, input);
  assert.equal((await createTimebankListing(db, alice, input)).id, listing.id);
  await assert.rejects(createTimebankListing(db, bob, input), { status: 409 });
  await assert.rejects(createTimebankListing(db, alice, { ...input, title: 'Changed' }), { status: 409 });
  await assert.rejects(updateTimebankListing(db, bob.id, listing.id, { status: 'closed' }), { status: 404 });
  await assert.rejects(proposeTimebankExchange(db, alice, exchangeInput(listing.id)), { status: 409 });
  await updateTimebankListing(db, alice.id, listing.id, { status: 'closed' });
  assert.equal((await timebankDashboard(db, alice)).listings.length, 1);
  assert.equal((await timebankDashboard(db, bob)).listings.length, 0);
  await assert.rejects(proposeTimebankExchange(db, bob, exchangeInput(listing.id)), { status: 409 });
  await updateTimebankListing(db, alice.id, listing.id, { status: 'open' });
  for (const minutes of [0, -15, 16, 1500, '60']) {
    await assert.rejects(proposeTimebankExchange(db, bob, { ...exchangeInput(listing.id), minutes }), { status: 400 });
  }
  const exchange = exchangeInput(listing.id);
  await proposeTimebankExchange(db, bob, exchange);
  await assert.rejects(proposeTimebankExchange(db, carol, exchange), { status: 409 });
  await assert.rejects(proposeTimebankExchange(db, bob, { ...exchange, minutes: 60 }), { status: 409 });
  database.sqlite.close();
});

test('declines and cancellations move no hours, and a closed listing can settle existing work', async () => {
  const database = new TimebankDatabase();
  const db = database.asD1();
  const listing = await createTimebankListing(db, alice, listingInput());
  for (const status of ['declined', 'canceled']) {
    const exchange = await proposeTimebankExchange(db, bob, exchangeInput(listing.id));
    await assert.rejects(resolveTimebankExchange(db, status === 'canceled' ? alice.id : bob.id, exchange.id, { status }), { status: 403 });
    await resolveTimebankExchange(db, status === 'canceled' ? bob.id : alice.id, exchange.id, { status });
    await assert.rejects(resolveTimebankExchange(db, alice.id, exchange.id, { status: 'confirmed' }), { status: 409 });
  }
  assert.equal((await timebankDashboard(db, alice)).account.balance_minutes, 0);
  assert.equal((await timebankDashboard(db, bob)).account.balance_minutes, 0);
  const exchange = await proposeTimebankExchange(db, bob, exchangeInput(listing.id));
  await updateTimebankListing(db, alice.id, listing.id, { status: 'closed' });
  const outcomes = await Promise.allSettled([
    resolveTimebankExchange(db, alice.id, exchange.id, { status: 'confirmed' }),
    resolveTimebankExchange(db, bob.id, exchange.id, { status: 'canceled' }),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal((await timebankDashboard(db, alice)).account.balance_minutes, 75);
  assert.equal((await timebankDashboard(db, bob)).account.balance_minutes, -75);
  database.sqlite.close();
});

test('HTTP routes authenticate mutations and reject malformed bodies', async (t) => {
  const database = new TimebankDatabase();
  t.after(() => database.sqlite.close());
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init: RequestInit) => {
    const token = new Headers(init.headers).get('Authorization');
    return token === 'Bearer alice'
      ? Response.json({ id: alice.id, full_name: alice.name })
      : Response.json({ detail: 'Invalid credentials' }, { status: 401 });
  });
  const env = { DB: database.asD1(), PIDP_BASE_URL: 'https://identity.example.test' };
  const routes = [['POST', '/listings'], ['PATCH', '/listings/unknown'], ['POST', '/exchanges'], ['PATCH', '/exchanges/unknown']];
  for (const [method, path] of routes) {
    const response = await app.request(`/api/timebank${path}`, { method }, env);
    assert.equal(response.status, 401);
  }
  assert.equal((await app.request('/api/timebank', { headers: { Authorization: 'Bearer invalid' } }, env)).status, 401);
  const headers = { Authorization: 'Bearer alice', 'Content-Type': 'application/json' };
  for (const body of ['null', '[]', 'not-json', '{}']) {
    assert.equal((await app.request('/api/timebank/listings', { method: 'POST', headers, body }, env)).status, 400);
  }
  const response = await app.request('/api/timebank/listings', { method: 'POST', headers, body: JSON.stringify(listingInput()) }, env);
  assert.equal(response.status, 201);
  const dashboard = await app.request('/api/timebank', { headers }, env);
  assert.equal(dashboard.headers.get('Cache-Control'), 'no-store');
  assert.equal((await dashboard.json() as { listings: unknown[] }).listings.length, 1);
});

test('communities isolate boards, balances, mutations and retry IDs for the same members', async () => {
  const database = new TimebankDatabase();
  const db = database.asD1();
  const a = 'code-collective', b = 'bmoretimebank';
  const listing = await createTimebankListing(db, alice, listingInput(), a);
  const other = await createTimebankListing(db, alice, listingInput(), b);
  const exchange = await proposeTimebankExchange(db, bob, exchangeInput(listing.id), a);
  await assert.rejects(proposeTimebankExchange(db, bob, exchangeInput(listing.id), b), { status: 409 });
  await assert.rejects(resolveTimebankExchange(db, alice.id, exchange.id, { status: 'confirmed' }, b), { status: 404 });
  await assert.rejects(updateTimebankListing(db, alice.id, listing.id, { status: 'closed' }, b), { status: 404 });
  await assert.rejects(createTimebankListing(db, alice, { ...listingInput(), id: listing.id }, b), { status: 409 });
  await resolveTimebankExchange(db, alice.id, exchange.id, { status: 'confirmed' }, a);
  assert.equal((await timebankDashboard(db, alice, a)).account.balance_minutes, 75);
  const dashboard = await timebankDashboard(db, alice, b);
  assert.equal(dashboard.account.balance_minutes, 0);
  assert.equal(dashboard.exchanges.length, 0);
  assert.deepEqual(dashboard.listings.map((row) => row.id), [other.id]);
  database.sqlite.close();
});

test('domain selection rejects unknown communities; only admins can customize or create them', async (t) => {
  const database = new TimebankDatabase();
  t.after(() => database.sqlite.close());
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init: RequestInit) => Response.json({ id: 'alice', full_name: 'Alice', is_sysadmin: new Headers(init.headers).get('Authorization') === 'Bearer admin' }));
  const env = { DB: database.asD1(), PIDP_BASE_URL: 'https://identity.example.test' };
  const request = (path: string, options: RequestInit = {}) => app.request(`https://bmoretimebank.codecollective.us/api/timebank${path}`, options, env);
  assert.equal((await (await request('/community')).json() as { id: string }).id, 'bmoretimebank');
  const tenant = await app.request('https://medtech.social/api/portal/tenant', {}, env);
  const medtech = await tenant.json() as { id: string; profile: string; features: string[] };
  assert.equal(medtech.id, 'baltimore-medtech');
  assert.equal(medtech.profile, 'baltimore-medtech');
  assert.deepEqual(medtech.features, ['directory', 'events', 'chat']);
  assert.equal((await app.request('https://community.medtech.social/api/portal/tenant', {}, env)).status, 404);
  assert.equal((await app.request('https://unknown.codecollective.us/api/timebank/community', {}, env)).status, 404);
  const body = JSON.stringify({ name: 'Neighbor Time', tagline: 'Share your time.', accent_color: '#453876' });
  assert.equal((await request('/communities/neighbortime', { method: 'PUT', body, headers: { Authorization: 'Bearer alice' } })).status, 403);
  assert.equal((await request('/communities/neighbortime', { method: 'PUT', body, headers: { Authorization: 'Bearer admin' } })).status, 200);
  assert.equal((await request('/communities/id', { method: 'PUT', body, headers: { Authorization: 'Bearer admin' } })).status, 400);
  const created = await app.request('https://neighbortime.codecollective.us/api/timebank/community', {}, env);
  assert.equal((await created.json() as { name: string }).name, 'Neighbor Time');
  const createdTenant = await app.request('https://neighbortime.codecollective.us/api/portal/tenant', {}, env);
  assert.equal((await createdTenant.json() as { features: string[] }).features.includes('timebank'), true);
});

test('photo uploads validate content and size, enforce ownership and community, and replace/remove storage', async (t) => {
  const { TimebankBucket } = await import('./helpers/timebankBucket');
  const database = new TimebankDatabase();
  const bucket = new TimebankBucket();
  t.after(() => database.sqlite.close());
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init: RequestInit) => {
    const id = new Headers(init.headers).get('Authorization')?.replace('Bearer ', '');
    return id ? Response.json({ id, full_name: id }) : Response.json({}, { status: 401 });
  });
  const env = { DB: database.asD1(), SCAN_IMAGES: bucket.asR2(), PIDP_BASE_URL: 'https://identity.example.test' };
  const listing = await createTimebankListing(database.asD1(), alice, listingInput(), 'bmoretimebank');
  const url = `https://bmoretimebank.codecollective.us/api/timebank/listings/${listing.id}/image`;
  const photo = new Uint8Array([137,80,78,71,13,10,26,10,0]);
  const options = { method: 'PUT', headers: { Authorization: 'Bearer alice', 'Content-Type': 'image/png' }, body: photo };
  assert.equal((await app.request(url, { ...options, headers: { ...options.headers, Authorization: 'Bearer bob' } }, env)).status, 404);
  assert.equal((await app.request(url.replace('bmoretimebank.', ''), options, env)).status, 404);
  assert.equal((await app.request(url, { ...options, body: '<svg onload="alert(1)" />' }, env)).status, 400);
  assert.equal((await app.request(url, { ...options, body: new Uint8Array(5 * 1024 * 1024 + 1) }, env)).status, 400);
  assert.equal((await app.request(url, options, env)).status, 200);
  const response = await app.request(url, {}, env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), photo);
  assert.equal((await app.request(url.replace('bmoretimebank.', ''), {}, env)).status, 404);
  assert.equal((await app.request(url, options, env)).status, 200);
  assert.equal(bucket.objects.size, 1);
  assert.equal((await app.request(url, { method: 'DELETE', headers: options.headers }, env)).status, 200);
  assert.equal(bucket.objects.size, 0);
  assert.equal((await app.request(url, {}, env)).status, 404);
});

test('request uptake counts distinct volunteers and confirmed providers without moving hours', async () => {
  const { setTimebankUptake } = await import('../src/timebank');
  const database = new TimebankDatabase();
  const db = database.asD1();
  const community = 'bmoretimebank';
  const request = await createTimebankListing(db, alice, listingInput('request'), community);
  const offer = await createTimebankListing(db, alice, listingInput(), community);
  const count = async () => (await timebankDashboard(db, alice, community)).listings.find((row) => row.id === request.id)!.uptake_count;
  await assert.rejects(setTimebankUptake(db, alice, request.id, true, community), { status: 409 });
  await assert.rejects(setTimebankUptake(db, bob, offer.id, true, community), { status: 409 });
  await assert.rejects(setTimebankUptake(db, bob, request.id, true, 'code-collective'), { status: 404 });
  await setTimebankUptake(db, bob, request.id, true, community);
  await setTimebankUptake(db, bob, request.id, true, community);
  await setTimebankUptake(db, carol, request.id, true, community);
  assert.equal(await count(), 2);
  assert.equal((await timebankDashboard(db, bob, community)).account.balance_minutes, 0);
  await setTimebankUptake(db, carol, request.id, false, community);
  assert.equal(await count(), 1);
  for (let i = 0; i < 2; i++) {
    const exchange = await proposeTimebankExchange(db, bob, exchangeInput(request.id), community);
    await resolveTimebankExchange(db, alice.id, exchange.id, { status: 'confirmed' }, community);
  }
  assert.equal(await count(), 1);
  await setTimebankUptake(db, bob, request.id, false, community);
  assert.equal(await count(), 1, 'confirmed providers stay counted after withdrawing their commitment');
  const own = (await timebankDashboard(db, bob, community)).listings.find((row) => row.id === request.id)!;
  assert.equal(own.user_has_helped, 1);
  await updateTimebankListing(db, alice.id, request.id, { status: 'closed' }, community);
  await assert.rejects(setTimebankUptake(db, carol, request.id, true, community), { status: 409 });
  database.sqlite.close();
});

test('request sorting orders the entire board before limiting each column', async () => {
  const { setTimebankUptake } = await import('../src/timebank');
  const database = new TimebankDatabase();
  const db = database.asD1();
  const popular = await createTimebankListing(db, alice, listingInput('request'));
  const newest = await createTimebankListing(db, alice, listingInput('request'));
  await createTimebankListing(db, alice, listingInput('offer'));
  database.sqlite.prepare('UPDATE timebank_listings SET created_at = ? WHERE id = ?').run('2000-01-01', popular.id);
  database.sqlite.prepare('UPDATE timebank_listings SET created_at = ? WHERE id = ?').run('2099-01-01', newest.id);
  await setTimebankUptake(db, bob, popular.id, true, 'code-collective');
  for (let i = 0; i < 205; i++) await createTimebankListing(db, alice, listingInput('request'));
  const list = async (sort: string) => (await timebankDashboard(db, bob, 'code-collective', sort)).listings.filter((row) => row.kind === 'request');
  assert.equal((await list('most'))[0].id, popular.id, 'an older popular request must not be lost to a recency limit');
  assert.equal((await list('most')).length, 200);
  assert.equal((await list('least'))[0].id, newest.id);
  assert.equal((await list('newest'))[0].id, newest.id);
  assert.equal((await timebankDashboard(db, bob)).listings.filter((row) => row.kind === 'offer').length, 1);
  await assert.rejects(timebankDashboard(db, bob, 'code-collective', 'invalid'), { status: 400 });
  database.sqlite.close();
});

test('analytics count confirmed hours once, distinguish circulation, rank recipients/providers and isolate communities', async () => {
  const { timebankAnalytics } = await import('../src/timebank');
  const database = new TimebankDatabase();
  const db = database.asD1();
  const denaBefore = database.sqlite.prepare('SELECT * FROM ledger_transactions ORDER BY id').all();
  const community = 'bmoretimebank';
  const creative = await createTimebankListing(db, alice, { ...listingInput(), category: 'Creative' }, community);
  const garden = await createTimebankListing(db, alice, { ...listingInput('request'), category: 'Home & garden' }, community);
  const exchange = async (id: string, minutes: number, status: string) => {
    const row = await proposeTimebankExchange(db, bob, { ...exchangeInput(id), minutes }, community);
    if (status !== 'pending') await resolveTimebankExchange(db, status === 'canceled' ? bob.id : alice.id, row.id, { status }, community);
  };
  await exchange(creative.id, 90, 'confirmed');
  await exchange(garden.id, 30, 'confirmed');
  await exchange(garden.id, 300, 'pending');
  await exchange(garden.id, 300, 'declined');
  await exchange(garden.id, 300, 'canceled');
  const report = await timebankAnalytics(db, community);
  assert.equal(report.rewarded_minutes, 120);
  assert.equal(report.circulation_minutes, 60);
  assert.equal(report.confirmed_exchanges, 2);
  assert.deepEqual(report.categories.map((row) => ({ ...row })), [{ category: 'Creative', minutes: 90 }, { category: 'Home & garden', minutes: 30 }]);
  assert.equal(report.providers[0].user_id, alice.id);
  assert.equal(report.providers[0].minutes, 90);
  assert.equal(report.beneficiaries[0].user_id, bob.id);
  assert.equal(report.beneficiaries[0].minutes, 90);
  assert.equal((await timebankAnalytics(db, 'code-collective')).rewarded_minutes, 0);
  assert.deepEqual((await timebankAnalytics(db, 'code-collective')).categories, []);
  await exchange(garden.id, 60, 'confirmed');
  assert.equal((await timebankAnalytics(db, community)).circulation_minutes, 0, 'balanced accounts have no outstanding credits');
  for (let i = 0; i < 101; i++) await exchange(creative.id, 15, 'confirmed');
  const complete = await timebankAnalytics(db, community);
  assert.equal(complete.confirmed_exchanges, 104);
  assert.equal(complete.rewarded_minutes, 1695, 'analytics are not limited to the 100-row personal history');
  assert.deepEqual(database.sqlite.prepare('SELECT * FROM ledger_transactions ORDER BY id').all(), denaBefore);
  database.sqlite.close();
});

test('analytics are admin-only and all new routes enforce authentication and host scope', async (t) => {
  const database = new TimebankDatabase();
  t.after(() => database.sqlite.close());
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init: RequestInit) => {
    const id = new Headers(init.headers).get('Authorization')?.replace('Bearer ', '');
    return Response.json({ id, full_name: id, is_sysadmin: id === 'alice' });
  });
  const env = { DB: database.asD1(), PIDP_BASE_URL: 'https://identity.example.test' };
  const request = await createTimebankListing(database.asD1(), alice, listingInput('request'), 'bmoretimebank');
  const url = 'https://bmoretimebank.codecollective.us/api/timebank';
  for (const [method, path] of [['GET', '/analytics'], ['PUT', `/listings/${request.id}/uptake`], ['DELETE', `/listings/${request.id}/uptake`]]) {
    assert.equal((await app.request(url + path, { method }, env)).status, 401);
  }
  assert.equal((await app.request(url + '/analytics', { headers: { Authorization: 'Bearer bob' } }, env)).status, 403);
  const report = await app.request(url + '/analytics', { headers: { Authorization: 'Bearer alice' } }, env);
  assert.equal(report.status, 200);
  assert.equal(report.headers.get('Cache-Control'), 'no-store');
  const uptake = `/listings/${request.id}/uptake`;
  assert.equal((await app.request(url + uptake, { method: 'PUT', headers: { Authorization: 'Bearer bob' } }, env)).status, 200);
  assert.equal((await app.request(url.replace('bmoretimebank.', '') + uptake, { method: 'DELETE', headers: { Authorization: 'Bearer bob' } }, env)).status, 404);
});
