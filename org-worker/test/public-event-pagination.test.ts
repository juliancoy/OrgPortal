import assert from 'node:assert/strict';
import test from 'node:test';
import {app} from '../src/index';
import {FullSchemaDb} from './helpers/fullSchemaDb';

test('public chronological and searched events honor offsets after ranking',async()=>{
 const db=new FullSchemaDb();try {
  for(let n=0;n<7;n++)db.sql.prepare('INSERT INTO events(id,ingest_key,title,slug,starts_at) VALUES(?,?,?,?,?)').run(`event-${n}`,`event-${n}`,'Pagination meetup',`event-${n}`,'2099-01-01T12:00:00Z');
  const env={DB:db.asD1()} as Parameters<typeof app.request>[2];
  for(const q of ['', '&q=Pagination']) {
   const ids=async(offset:number)=>{
    const response=await app.request(`/api/network/events/public?limit=3&offset=${offset}${q}`,{},env);
    assert.equal(response.status,200);
    return (await response.json() as {id:string}[]).map(e=>e.id);
   };
   assert.deepEqual(await ids(0),['event-0','event-1','event-2']);
   assert.deepEqual(await ids(3),['event-3','event-4','event-5']);
   assert.deepEqual(await ids(6),['event-6']);
   assert.deepEqual(await ids(7),[]);
  }
 }finally{db.sql.close()}
});
