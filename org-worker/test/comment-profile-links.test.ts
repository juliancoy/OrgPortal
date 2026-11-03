import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/index';
import { EventTestDb } from './event-test-db';

test('comment avatars resolve current public slugs including profiles with hidden contact information', async t => {
 const db = new EventTestDb(); t.after(() => db.close());
 await db.prepare('CREATE TABLE user_contact_pages (user_id TEXT PRIMARY KEY, slug TEXT UNIQUE, enabled INTEGER, links TEXT)').run();
 await db.prepare('CREATE TABLE portal_account_activity(user_id TEXT,user_name TEXT)').run();
 await db.prepare('CREATE TABLE IF NOT EXISTS organization_memberships(user_id TEXT,user_name TEXT,status TEXT)').run();
 await db.prepare('ALTER TABLE organization_memberships ADD COLUMN user_name TEXT').run();
 await db.prepare('CREATE TABLE IF NOT EXISTS ledger_accounts(user_id TEXT,name TEXT,entity_type TEXT)').run();
 await db.prepare('CREATE TABLE event_registrations (user_id TEXT, event_id TEXT)').run();
 await db.prepare("INSERT INTO user_contact_pages VALUES ('alice-id','alice',1,'[]'),('bob-id','alice-id',1,'[]'),('private-id','private',0,'[]')").run();
 t.mock.method(globalThis,'fetch',async()=>new Response('Unauthorized',{status:401}));
 const env = { DB: db } as unknown as Env;
 const read=(id:string)=>app.request(`https://org.test/api/network/users/by-id/${id}/profile`,{},env);
 const alice=await read('alice-id');
 assert.equal(alice.status,302); assert.equal(alice.headers.get('location'),'/users/alice');
 assert.equal(alice.headers.get('cache-control'),'no-store');
 await db.prepare("UPDATE user_contact_pages SET slug='alice-updated' WHERE user_id='alice-id'").run();
 assert.equal((await read('alice-id')).headers.get('location'),'/users/alice-updated');
 assert.equal((await read('private-id')).status,302);
 assert.equal((await read('missing')).status,404);
});
