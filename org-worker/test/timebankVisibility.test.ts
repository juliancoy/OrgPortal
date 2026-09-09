import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/index';
import { createTimebankListing, updateTimebankListing, timebankDashboard } from '../src/timebank';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { TimebankBucket } from './helpers/timebankBucket';

const alice = { id: 'alice', name: 'Alice' }, bob = { id: 'bob', name: 'Bob' };
const community = 'bmoretimebank';
const input = (kind = 'offer', visibility?: string) => ({
  id: crypto.randomUUID(), kind, title: `${kind} from a neighbor`, description: 'Help with the garden',
  minutes: 60, ...(visibility === undefined ? {} : { visibility }),
});

test('guests see public offers and requests from all authors; members see the full community', async (t) => {
  const database = new TimebankDatabase(), db = database.asD1();
  t.after(() => database.sqlite.close());
  const publicIds = [], allIds = [];
  for (const member of [alice, bob]) for (const kind of ['offer', 'request']) {
    const listing = await createTimebankListing(db, member, input(kind), community);
    assert.equal(listing!.visibility, 'public');
    publicIds.push(listing!.id); allIds.push(listing!.id);
    const restricted = await createTimebankListing(db, member, input(kind, 'members'), community);
    allIds.push(restricted!.id);
  }
  await createTimebankListing(db, alice, input(), 'code-collective');
  const closed = await createTimebankListing(db, bob, input(), community);
  await updateTimebankListing(db, bob.id, closed!.id, { status: 'closed' }, community);
  const before = database.sqlite.prepare('SELECT total_changes() AS count').get();
  const guest = await timebankDashboard(db, null, community);
  assert.deepEqual(database.sqlite.prepare('SELECT total_changes() AS count').get(), before, 'Browsing must not create an account or contact');
  assert.equal(guest.account, null);
  assert.deepEqual(guest.exchanges, []);
  assert.deepEqual(guest.listings.map(row => row.id).sort(), publicIds.sort());
  assert.deepEqual((await timebankDashboard(db, alice, community)).listings.map(row => row.id).sort(), allIds.sort());
});

test('visibility is checked before the per-column limit and only the owner can change it', async (t) => {
  const database = new TimebankDatabase(), db = database.asD1();
  t.after(() => database.sqlite.close());
  const listing = await createTimebankListing(db, alice, input(), community);
  database.sqlite.prepare('UPDATE timebank_listings SET created_at = ? WHERE id = ?').run('2020-01-01', listing!.id);
  for (let i = 0; i < 201; i++) await createTimebankListing(db, bob, input('offer', 'members'), community);
  assert.deepEqual((await timebankDashboard(db, null, community)).listings.map(row => row.id), [listing!.id]);
  await assert.rejects(updateTimebankListing(db, bob.id, listing!.id, { visibility: 'members' }, community), { status: 404 });
  await assert.rejects(updateTimebankListing(db, alice.id, listing!.id, { visibility: 'members' }, 'code-collective'), { status: 404 });
  for (const visibility of ['invalid', '', null, true]) {
    await assert.rejects(createTimebankListing(db, alice, { ...input(), visibility }, community), { status: 400 });
    await assert.rejects(updateTimebankListing(db, alice.id, listing!.id, { visibility }, community), { status: 400 });
  }
  await updateTimebankListing(db, alice.id, listing!.id, { visibility: 'members' }, community);
  assert.deepEqual((await timebankDashboard(db, null, community)).listings, []);
  await updateTimebankListing(db, alice.id, listing!.id, { visibility: 'public' }, community);
  assert.deepEqual((await timebankDashboard(db, null, community)).listings.map(row => row.id), [listing!.id]);
});

test('HTTP visibility protects details and photos, rejects invalid credentials, and keeps actions authenticated', async (t) => {
  const database = new TimebankDatabase(), bucket = new TimebankBucket();
  t.after(() => database.sqlite.close());
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init: RequestInit) => {
    const id = new Headers(init.headers).get('Authorization')?.replace('Bearer ', '');
    return id === 'alice' || id === 'bob'
      ? Response.json({ id, full_name: id }) : Response.json({}, { status: 401 });
  });
  const env = { DB: database.asD1(), SCAN_IMAGES: bucket.asR2(), PIDP_BASE_URL: 'https://identity.example.test' };
  const base = 'https://bmoretimebank.codecollective.us/api/timebank';
  const aliceHeaders = { Authorization: 'Bearer alice', 'Content-Type': 'application/json' };
  const listing = await createTimebankListing(env.DB, alice, input('offer', 'members'), community);
  const detail = `${base}/listings/${listing!.id}`, photoUrl = `${detail}/image`;
  const photo = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  assert.equal((await app.request(photoUrl, { method: 'PUT', headers: { Authorization: 'Bearer alice', 'Content-Type': 'image/png' }, body: photo }, env)).status, 200);
  for (const url of [detail, photoUrl]) {
    assert.equal((await app.request(url, {}, env)).status, 404);
    assert.equal((await app.request(url, { headers: { Authorization: 'Bearer invalid' } }, env)).status, 401);
    assert.equal((await app.request(url, { headers: { Authorization: 'Bearer bob' } }, env)).status, 200);
    assert.equal((await app.request(url.replace('bmoretimebank.', ''), { headers: aliceHeaders }, env)).status, 404);
  }
  assert.equal((await app.request(base, { headers: { Authorization: 'Bearer invalid' } }, env)).status, 401);
  for (const [method, path] of [['POST', '/listings'], ['PATCH', `/listings/${listing!.id}`], ['PUT', `/listings/${listing!.id}/uptake`], ['POST', '/exchanges'], ['GET', '/notifications'], ['GET', '/analytics']]) {
    assert.equal((await app.request(`${base}${path}`, { method }, env)).status, 401);
  }
  const setVisibility = async (visibility: string) => {
    const response = await app.request(detail, { method: 'PATCH', headers: aliceHeaders, body: JSON.stringify({ visibility }) }, env);
    assert.equal(response.status, 200);
  };
  await setVisibility('public');
  const board = await app.request(base, {}, env);
  assert.equal(board.status, 200);
  assert.equal(board.headers.get('Cache-Control'), 'no-store');
  const data = await board.json() as { account: unknown; exchanges: unknown[]; listings: { id: string }[]; can_manage_community: boolean };
  assert.equal(data.account, null); assert.deepEqual(data.exchanges, []); assert.equal(data.can_manage_community, false);
  assert.deepEqual(data.listings.map(row => row.id), [listing!.id]);
  assert.equal((await app.request(detail, {}, env)).status, 200);
  const publicPhoto = await app.request(photoUrl, {}, env);
  assert.equal(publicPhoto.status, 200);
  assert.equal(publicPhoto.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(new Uint8Array(await publicPhoto.arrayBuffer()), photo);
  await setVisibility('members');
  for (const url of [detail, photoUrl]) assert.equal((await app.request(url, {}, env)).status, 404);
  await updateTimebankListing(env.DB, alice.id, listing!.id, { visibility: 'public', status: 'closed' }, community);
  for (const url of [detail, photoUrl]) assert.equal((await app.request(url, {}, env)).status, 404);
});
