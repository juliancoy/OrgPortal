import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/index';
import { createTimebankListing, publicTimebankOffers, updateTimebankListing } from '../src/timebank';
import { TimebankDatabase } from './helpers/timebankDatabase';

const alice = { id: 'alice', name: 'Alice' }, bob = { id: 'bob', name: 'Bob' };
const input = (visibility = 'public', kind = 'offer') => ({
  id: crypto.randomUUID(), kind, title: 'Bicycle repairs', description: 'I can fix your bicycle.',
  location: 'Baltimore', minutes: 60, visibility,
});

test('website feed shares public offers from all communities with original portal links', async (t) => {
  const database = new TimebankDatabase(), db = database.asD1();
  t.after(() => database.sqlite.close());
  const ids: string[] = [];
  for (const community of ['code-collective', 'bmoretimebank']) {
    const offered = await createTimebankListing(db, community === 'code-collective' ? alice : bob, input(), community);
    ids.push(offered!.id);
    database.sqlite.prepare('UPDATE timebank_listings SET image_key = ? WHERE id = ?').run('photo/key', offered!.id);
    await createTimebankListing(db, alice, input('members'), community);
    await createTimebankListing(db, bob, input('public', 'request'), community);
    const closed = await createTimebankListing(db, bob, input(), community);
    await updateTimebankListing(db, bob.id, closed!.id, { status: 'closed' }, community);
  }
  const response = await app.request('/api/timebank/public-offers', {}, { DB: db });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const page = await response.json() as Awaited<ReturnType<typeof publicTimebankOffers>>;
  assert.deepEqual(page.items.map(item => item.id).sort(), ids.sort());
  assert.deepEqual(page.items.map(item => item.member_name).sort(), ['Alice', 'Bob']);
  for (const item of page.items) {
    const hostname = item.member_name === 'Alice' ? 'codecollective.us' : 'bmoretimebank.codecollective.us';
    assert.equal(item.url, `https://${hostname}/p/timebanking?listing=${item.id}`);
    assert.equal(item.image_url, `https://${hostname}/api/org/api/timebank/listings/${item.id}/image?v=photo%2Fkey`);
    assert.equal('contact' in item, false);
  }
  assert.equal('account' in page, false);
  assert.equal('exchanges' in page, false);
  // Even a logged-in site visitor receives only the public showcase.
  const signedIn = await app.request('/api/timebank/public-offers', { headers: { Authorization: 'Bearer alice' } }, { DB: db });
  assert.deepEqual(await signedIn.json(), page);
  const bmore = page.items.find(item => item.member_name === 'Bob')!;
  await updateTimebankListing(db, bob.id, bmore.id, { visibility: 'members' }, 'bmoretimebank');
  assert.equal((await publicTimebankOffers(db)).items.some(item => item.id === bmore.id), false);
});

test('website feed paginates timestamp ties and filters restricted offers before limiting', async (t) => {
  const database = new TimebankDatabase(), db = database.asD1();
  t.after(() => database.sqlite.close());
  const ids = [];
  for (let i = 0; i < 29; i++) {
    const listing = await createTimebankListing(db, alice, input(), 'bmoretimebank');
    ids.push(listing!.id);
  }
  database.sqlite.prepare('UPDATE timebank_listings SET created_at = ?').run('2026-09-09T00:00:00.000Z');
  for (let i = 0; i < 14; i++) await createTimebankListing(db, bob, input('members'), 'bmoretimebank');
  const found = [];
  let cursor: string | null = null;
  do {
    const page = await publicTimebankOffers(db, cursor || undefined);
    assert.equal(page.items.length, found.length < 24 ? 12 : 5);
    found.push(...page.items.map(item => item.id));
    cursor = page.next_cursor;
  } while (cursor);
  assert.deepEqual(found, ids.sort().reverse());
  for (const before of ['bad', '2026-09-09', 'invalid|id', '2026-09-09|id|extra', 'x'.repeat(101)]) {
    const response = await app.request(`/api/timebank/public-offers?before=${encodeURIComponent(before)}`, {}, { DB: db });
    assert.equal(response.status, 400);
  }
});

test('empty website feed does not create members or contacts', async (t) => {
  const database = new TimebankDatabase();
  t.after(() => database.sqlite.close());
  const before = database.sqlite.prepare('SELECT total_changes() AS count').get();
  assert.deepEqual(await publicTimebankOffers(database.asD1()), { items: [], next_cursor: null });
  assert.deepEqual(database.sqlite.prepare('SELECT total_changes() AS count').get(), before);
});
