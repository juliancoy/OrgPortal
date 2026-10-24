import assert from 'node:assert/strict';
import test from 'node:test';
import {TimebankDatabase} from './helpers/timebankDatabase';
import {enqueueUserPush,consumePushBatch,type PushDeliveryJob} from '../src/push';
import {claimPush,dispatchPushOutbox,expirePushOutbox,finishPush,persistPush,retryPush} from '../src/pushOutbox';

const job:PushDeliveryJob={eventId:'synthetic-event',userId:'synthetic-user',title:'Synthetic alert',body:'Local fixture',deepLink:'/test'};
test('queue failure retains full payload for recovery and the dispatcher retries it',async t=>{
 const db=new TimebankDatabase();t.after(()=>db.sqlite.close());let sent=0;
 const env={DB:db.asD1(),PUSH_QUEUE:{send:async()=>{if(!sent++)throw Error('queue offline')}}} as unknown as Env;
 await assert.rejects(enqueueUserPush(env,job),/queue offline/);
 const saved=db.sqlite.prepare('SELECT * FROM push_outbox').get()!;
 assert.deepEqual(JSON.parse(String(saved.payload_json)),job);
 // Simulates restoring the D1 row after losing the transport queue.
 db.sqlite.prepare("UPDATE push_outbox SET next_attempt_at='2000-01-01'").run();
 assert.deepEqual(await dispatchPushOutbox(env),{queued:1,failed:0});
 assert.equal(sent,2);
 assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM push_outbox').get()!.n,1);
});
test('leases serialize consumers, failures release ownership and completion removes personal content',async t=>{
 const db=new TimebankDatabase();t.after(()=>db.sqlite.close());const d1=db.asD1();
 const id=await persistPush(d1,job);const first=await claimPush(d1,id);
 assert.ok(first.token);assert.equal((await claimPush(d1,id)).busy,true);
 await retryPush(d1,id,first.token!);const second=await claimPush(d1,id);assert.ok(second.token);
 await finishPush(d1,id,first.token!);assert.ok(db.sqlite.prepare('SELECT payload_json FROM push_outbox').get()!.payload_json);
 await finishPush(d1,id,second.token!);
 const row=db.sqlite.prepare('SELECT * FROM push_outbox').get()!;
 assert.equal(row.payload_json,null);assert.equal(row.user_id,null);
 assert.equal((await claimPush(d1,id)).job,null);
 await persistPush(d1,job);assert.equal((await claimPush(d1,id)).job,null);
});
test('expired content is cleared, late queue messages cannot revive it, and opaque IDs retire',async t=>{
 const db=new TimebankDatabase();t.after(()=>db.sqlite.close());const d1=db.asD1();const before=Date.now()-24*3600000;
 await persistPush(d1,job,before);assert.equal(await expirePushOutbox(d1,Date.now(),true),1);
 assert.equal(await expirePushOutbox(d1,Date.now()),1);
 let acked=0;await consumePushBatch({messages:[{body:job,timestamp:new Date(before),ack:()=>acked++,retry:()=>assert.fail('expired job retried')}]} as unknown as MessageBatch<PushDeliveryJob>,{DB:d1} as Env);
 assert.equal(acked,1);assert.equal(db.sqlite.prepare('SELECT payload_json FROM push_outbox').get()!.payload_json,null);
 await expirePushOutbox(d1,Date.now()+8*86400000);
 assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM push_outbox').get()!.n,0);
});
test('replicas never store or dispatch push jobs',async t=>{
 const db=new TimebankDatabase();t.after(()=>db.sqlite.close());
 const env={DB:db.asD1(),ORGANIZATION_REPLICA_SOURCE:'https://example.test',PUSH_QUEUE:{send:async()=>assert.fail('replica send')}} as unknown as Env;
 await enqueueUserPush(env,job);assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM push_outbox').get()!.n,0);
 assert.deepEqual(await dispatchPushOutbox(env),{queued:0,failed:0});
});
