import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { directoryRows } from '../src/index';
import { loadDirectoryAliases } from '../src/directoryIdentity';
test('aliases group before pagination and retain separate same-name people',async t=>{
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec(`CREATE TABLE user_contact_pages(user_id TEXT,user_name TEXT,photo_url TEXT,enabled INTEGER,slug TEXT,headline TEXT);
 CREATE TABLE portal_account_activity(user_id TEXT,user_name TEXT);
 CREATE TABLE organization_memberships(user_id TEXT,user_name TEXT);
 CREATE TABLE ledger_accounts(user_id TEXT,name TEXT,entity_type TEXT);
 INSERT INTO user_contact_pages VALUES('alias','Alex',NULL,1,'alex-old','Engineer'),('different','Alex',NULL,1,'alex-other',NULL);
 INSERT INTO portal_account_activity VALUES('primary','Alex'),('alias','Alex'),('last','Zed');`);
 const db={prepare:(q:string)=>({bind:(...args:unknown[])=>({all:async()=>({results:sql.prepare(q).all(...args as [])})})})} as unknown as D1Database;
 t.mock.method(globalThis,'fetch',async()=>Response.json({aliases:[{account_id:'alias',canonical_user_id:'primary'}]}));
 const env={DB:db,PIDP_DIRECTORY_TOKEN:'fixture',PIDP_BASE_URL:'https://identity.invalid'} as Env;
 const first=await directoryRows(env,'',2,0);assert.deepEqual(first.map(x=>x.user_id),['different','primary']);
 assert.equal(first[1].contact_slug,'alex-old');
 assert.deepEqual((await directoryRows(env,'',2,2)).map(x=>x.user_id),['last']);
 assert.equal((await directoryRows(env,'alex',40,0)).length,2);
 sql.exec(`INSERT INTO user_contact_pages VALUES('primary','Alex Canonical',NULL,1,'canonical',NULL);`);
 assert.equal((await directoryRows(env,'canonical',40,0))[0].contact_slug,'canonical');
});
test('identity map rejects conflicting and chained aliases',async t=>{
 assert.deepEqual(await loadDirectoryAliases({} as Env),[]);
 for(const aliases of [[{account_id:'a',canonical_user_id:'b'},{account_id:'a',canonical_user_id:'c'}],[{account_id:'a',canonical_user_id:'b'},{account_id:'b',canonical_user_id:'c'}],null]){
 const mock=t.mock.method(globalThis,'fetch',async()=>Response.json({aliases}));
 await assert.rejects(loadDirectoryAliases({PIDP_DIRECTORY_TOKEN:'fixture'} as Env),/temporarily unavailable/);mock.mock.restore();
 }
});
