import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { EventTestDb } from './event-test-db';
import { profileEvents } from '../src/profileEvents';
test('registered profile events exclude hosted-only, cancelled, past and other users registrations', async () => {
 const db = new EventTestDb();
 try {
  for (const sql of readFileSync(new URL('../migrations/0018_event_registrations.sql', import.meta.url),'utf8').split(';').filter(sql=>sql.trim())) await db.prepare(sql).run();
  for (const [id,date,host] of [['joined','2099-01-01','bob'],['hosted','2099-01-01','alice'],['past','2020-01-01','bob'],['cancelled','2099-01-01','bob'],['other','2099-01-01','bob']]) {
   await db.prepare("INSERT INTO events (id,ingest_key,title,slug,starts_at,host_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,'','')").bind(id,id,id,id,date,host).run();
  }
  for (const id of ['joined','past','cancelled']) await db.prepare('INSERT INTO event_registrations (event_id,user_id) VALUES (?,?)').bind(id,'alice').run();
  await db.prepare("DELETE FROM event_registrations WHERE event_id='cancelled'").run();
  await db.prepare("INSERT INTO event_registrations (event_id,user_id) VALUES ('other','bob')").run();
  const rows = await profileEvents<{id:string}>(db as unknown as D1Database,'alice',true,true,60);
  assert.deepEqual(rows.map(row=>row.id),['joined']);
 } finally { db.close(); }
});
