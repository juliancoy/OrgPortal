import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { directoryRows } from '../src/index';
import { directoryExcludedAccountIds } from '../src/peopleDirectoryExclusions';

test('People excludes verified bots before search and pagination, including renamed bots', async t => {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(`CREATE TABLE user_contact_pages(user_id TEXT,user_name TEXT,photo_url TEXT,enabled INTEGER,slug TEXT,headline TEXT);
    CREATE TABLE portal_account_activity(user_id TEXT,user_name TEXT);
    CREATE TABLE organization_memberships(user_id TEXT,user_name TEXT);
    CREATE TABLE ledger_accounts(user_id TEXT,name TEXT,entity_type TEXT);
    INSERT INTO user_contact_pages VALUES
      ('human','Bob Robotson',NULL,1,'bob','Engineer'),
      ('private','Private Person',NULL,0,'private','Private headline');
    INSERT INTO portal_account_activity VALUES ('member','Community Member');`);
  const insert = sql.prepare('INSERT INTO user_contact_pages VALUES(?,?,NULL,1,NULL,NULL)');
  for (const id of directoryExcludedAccountIds) insert.run(id, 'A renamed service');
  const db = { prepare: (query: string) => ({ bind: (...args: unknown[]) => ({ all: async () => ({ results: sql.prepare(query).all(...args as []) }) }) }) } as unknown as D1Database;
  const env = { DB: db } as Env;
  assert.deepEqual((await directoryRows(env, '', 2, 0)).map(row => row.user_id), ['human', 'member']);
  const page = await directoryRows(env, '', 2, 2);
  assert.deepEqual(page.map(row => row.user_id), ['private']);
  assert.equal(page[0].contact_slug, null);
  assert.equal(page[0].headline, null);
  assert.deepEqual(await directoryRows(env, 'service', 40, 0), []);
  assert.deepEqual((await directoryRows(env, 'robot', 40, 0)).map(row => row.user_id), ['human']);
});
