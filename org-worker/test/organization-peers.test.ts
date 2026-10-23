import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { listOrganizationPeers } from '../src/organizationPeers';

test('peer lookup returns bounded matching organizations ranked by shared interests', async t => {
  const database = new DatabaseSync(':memory:'); t.after(() => database.close());
  database.exec('CREATE TABLE organizations (id TEXT PRIMARY KEY,name TEXT,slug TEXT,image_url TEXT,tags TEXT,description TEXT)');
  const insert = database.prepare('INSERT INTO organizations VALUES (?,?,?,?,?,?)');
  insert.run('source','Source','source',null,'["AI","Health"]','');
  insert.run('both','Both','both',null,'["ai","health"]','Neonatal research');
  insert.run('one','One','one',null,'["AI"]','');
  insert.run('other','Other','other',null,'["Sports"]','');
  insert.run('invalid','Invalid','invalid',null,'broken','');
  const db = { prepare(sql: string) { return { bind(...args: unknown[]) { const statement = database.prepare(sql); return { first: async () => statement.get(...args), all: async () => ({results: statement.all(...args)}) }; } }; } } as unknown as D1Database;
  const first = await listOrganizationPeers(db,'source','',1);
  assert.deepEqual(first.organizations.map(row => row.id),['both']);
  assert.equal(first.hasMore,true);
  const all = await listOrganizationPeers(db,'source','',12);
  assert.deepEqual(all.organizations.map(row => row.id),['both','one']);
  assert.equal(all.hasMore,false);
  assert.deepEqual((await listOrganizationPeers(db,'source','neonatal')).organizations.map(row => row.id),['both']);
  assert.deepEqual((await listOrganizationPeers(db,'other')).organizations,[]);
  await assert.rejects(listOrganizationPeers(db,'missing'),/Organization not found/);
});
