import test from 'node:test';
import assert from 'node:assert/strict';
import { EventTestDb } from './event-test-db';
import { profileAvailability } from '../src/profileAvailability';

test('availability is hidden by default, respects profile privacy, and only exposes selected future slots', async () => {
 const db = new EventTestDb();
 try {
  await db.prepare('CREATE TABLE profile_availability_settings (user_id TEXT PRIMARY KEY, public INTEGER NOT NULL DEFAULT 0)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS account_availability (user_id TEXT, slot TEXT, available INTEGER)').run();
  for (const [user,slot,available] of [['alice','2026-10-08T15:00:00Z',1],['alice','2026-10-08T15:30:00Z',0],['alice','2026-10-01T15:00:00Z',1],['alice','2027-01-01T15:00:00Z',1],['bob','2026-10-08T16:00:00Z',1]]) {
   await db.prepare('INSERT INTO account_availability (user_id,slot,available) VALUES (?,?,?)').bind(user,slot,available).run();
  }
  const d1 = db as unknown as D1Database, now = new Date('2026-10-07T12:00:00Z');
  assert.deepEqual(await profileAvailability(d1,'alice',true,false,now),{public:false,slots:[]});
  assert.deepEqual((await profileAvailability(d1,'alice',true,true,now)).slots,['2026-10-08T15:00:00Z']);
  await db.prepare("INSERT INTO profile_availability_settings VALUES ('alice',1)").run();
  assert.deepEqual(await profileAvailability(d1,'alice',true,false,now),{public:true,sharing_required:true,slots:[]});
  assert.deepEqual(await profileAvailability(d1,'alice',false,false,now),{public:false,slots:[]});
  await db.prepare("UPDATE profile_availability_settings SET public=0 WHERE user_id='alice'").run();
  assert.deepEqual(await profileAvailability(d1,'alice',true,false,now),{public:false,slots:[]});
 } finally { db.close(); }
});


test('public availability requires reciprocal sharing and preserves owner access', async () => {
 const db = new EventTestDb();
 try {
  await db.prepare('CREATE TABLE profile_availability_settings (user_id TEXT PRIMARY KEY, public INTEGER)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS account_availability (user_id TEXT, slot TEXT, available INTEGER)').run();
  await db.prepare('CREATE TABLE user_contact_pages (user_id TEXT PRIMARY KEY, slug TEXT, enabled INTEGER)').run();
  await db.prepare("INSERT INTO profile_availability_settings VALUES ('alice',1),('bob',1)").run();
  await db.prepare("INSERT INTO user_contact_pages (user_id,slug,enabled) VALUES ('alice','alice',1),('bob','bob',1)").run();
  await db.prepare("INSERT INTO account_availability VALUES ('alice','2026-10-08T15:00:00Z',1)").run();
  const d1 = db as unknown as D1Database, now = new Date('2026-10-07T12:00:00Z');
  const read = () => profileAvailability(d1,'alice',true,false,now,'bob');
  assert.deepEqual(await read(),{public:true,sharing_required:true,slots:[]});
  await db.prepare("INSERT INTO account_availability VALUES ('bob','2026-10-08T16:00:00Z',0)").run();
  assert.deepEqual(await read(),{public:true,slots:['2026-10-08T15:00:00Z']});
  await db.prepare("UPDATE profile_availability_settings SET public=0 WHERE user_id='bob'").run();
  assert.deepEqual(await read(),{public:true,sharing_required:true,slots:[]});
  await db.prepare("UPDATE profile_availability_settings SET public=1 WHERE user_id='bob'").run();
  await db.prepare("UPDATE user_contact_pages SET enabled=0 WHERE user_id='bob'").run();
  assert.deepEqual(await read(),{public:true,sharing_required:true,slots:[]});
  await db.prepare("UPDATE user_contact_pages SET enabled=1 WHERE user_id='bob'").run();
  await db.prepare("UPDATE account_availability SET slot='2026-10-01T16:00:00Z' WHERE user_id='bob'").run();
  assert.deepEqual(await read(),{public:true,sharing_required:true,slots:[]});
  assert.deepEqual((await profileAvailability(d1,'alice',true,true,now)).slots,['2026-10-08T15:00:00Z']);
 } finally { db.close(); }
});
