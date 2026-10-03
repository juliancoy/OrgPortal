import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { HTTPException } from 'hono/http-exception';
import { accountSelection } from '../src/accountAvailability';
import { availabilityRoutes } from '../src/availability';
import { TimebankDatabase } from './helpers/timebankDatabase';
const monday='2026-10-05T13:00:00.000Z',future='2026-10-26T13:00:00.000Z';
test('median respects weekday, local time, ties, empty weeks, chronological history, and daylight saving',()=>{
 const rows=[{slot:monday,available:1},{slot:'2026-10-12T13:00:00.000Z',available:1},{slot:'2026-10-19T13:00:00.000Z',available:0}];
 assert.deepEqual(accountSelection([future],rows,'America/New_York'),{slots:[future],suggested_slots:[future]});
 assert.deepEqual(accountSelection([future],rows.slice(1),'America/New_York').slots,[]);
 assert.deepEqual(accountSelection(['2026-10-27T13:00:00.000Z'],rows,'America/New_York').slots,[]);
 assert.deepEqual(accountSelection([future],[...rows,{slot:'2026-10-27T13:00:00.000Z',available:0}],'America/New_York').slots,[]);
 assert.deepEqual(accountSelection([future],[...rows,{slot:future,available:0}],'America/New_York').slots,[]);
 assert.deepEqual(accountSelection([monday],[{slot:future,available:1}],'America/New_York').slots,[]);
 assert.deepEqual(accountSelection([future],[],'America/New_York').slots,[]);
 assert.deepEqual(accountSelection(['2026-11-02T14:00:00.000Z'],[{slot:future,available:1}],'America/New_York').slots,['2026-11-02T14:00:00.000Z']);
 assert.deepEqual(accountSelection(['2026-10-11T23:00:00.000Z'],[{slot:'2026-10-04T23:00:00.000Z',available:1}],'Asia/Tokyo').slots,['2026-10-11T23:00:00.000Z']);
});
test('account entries persist across polls and tenants, remain private, and never learn unconfirmed suggestions',async()=>{
 const db=new TimebankDatabase();try{
 for(const file of ['0042_availability_polls.sql','0046_user_tasks.sql','0047_account_availability.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 const app=availabilityRoutes(async(_env,req)=>{const id=req.headers.get('authorization');if(!id)throw new HTTPException(401);return {id}});
 const request=(path:string,method='GET',body?:unknown,user='alice',host='medtech.social')=>app.fetch(new Request(`https://${host}${path}`,{method,headers:{...(user?{authorization:user}:{}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),{DB:db.asD1()} as Env);
 const create=async(slots:string[],host='medtech.social')=>(await (await request('/','POST',{title:'Account calendar',timezone:'UTC',slots},'alice',host)).json() as {id:string}).id;
 const id=await create([monday,'2026-10-05T13:30:00.000Z']);
 assert.equal((await request(`/${id}/me`,'PUT',{slots:[monday],user_id:'bob'})).status,200);
 const other=await create([monday,'2026-10-05T13:30:00.000Z'],'codecollective.us');
 assert.deepEqual((await (await request(`/${other}/me`,'GET',undefined,'alice','codecollective.us')).json() as {slots:string[]}).slots,[monday]);
 assert.equal((await request(`/${other}/me`,'GET',undefined,'','codecollective.us')).status,401);
 assert.deepEqual((await (await request(`/${other}/me`,'GET',undefined,'bob','codecollective.us')).json() as {slots:string[]}).slots,[]);
 const next=await create([future]);
 assert.deepEqual((await (await request(`/${next}/me`)).json() as {suggested_slots:string[]}).suggested_slots,[future]);
 assert.equal((db.sqlite.prepare('SELECT count(*) AS n FROM account_availability WHERE slot = ?').get(future) as {n:number}).n,0);
 assert.equal((await request(`/${next}/me?timezone=invalid`)).status,400);
 await request(`/${next}/me`,'PUT',{slots:[]});
 assert.deepEqual((await (await request(`/${next}/me`)).json() as {slots:string[]}).slots,[]);
 await request(`/${next}`,'PATCH',{closed:true});
 assert.equal((await request(`/${next}/me`,'PUT',{slots:[future]})).status,409);
 assert.equal((db.sqlite.prepare('SELECT available FROM account_availability WHERE user_id = ? AND slot = ?').get('alice',future) as {available:number}).available,0);
 }finally{db.sqlite.close()}
});
test('migration preserves latest existing responses, including explicit unavailability',()=>{
 const db=new TimebankDatabase();try{
 db.sqlite.exec(readFileSync(new URL('../migrations/0042_availability_polls.sql',import.meta.url),'utf8'));
 const tenant=(db.sqlite.prepare('SELECT id FROM portal_tenants LIMIT 1').get() as {id:string}).id;
 for(const id of ['old','new'])db.sqlite.prepare('INSERT INTO availability_polls (id,tenant_id,owner_user_id,title,timezone,slots_json) VALUES (?,?,?,?,?,?)').run(id,tenant,'alice','History','UTC',JSON.stringify([monday]));
 db.sqlite.prepare('INSERT INTO availability_responses (poll_id,user_id,slots_json,updated_at) VALUES (?,?,?,?)').run('old','alice',JSON.stringify([monday]),'2026-10-01 00:00:00');
 db.sqlite.prepare('INSERT INTO availability_responses (poll_id,user_id,slots_json,updated_at) VALUES (?,?,?,?)').run('new','alice','[]','2026-10-02 00:00:00');
 db.sqlite.exec(readFileSync(new URL('../migrations/0047_account_availability.sql',import.meta.url),'utf8'));
 assert.equal((db.sqlite.prepare('SELECT available FROM account_availability WHERE user_id = ? AND slot = ?').get('alice',monday) as {available:number}).available,0);
 }finally{db.sqlite.close()}
});
