import test from 'node:test';
import assert from 'node:assert/strict';
import { HTTPException } from 'hono/http-exception';
import { EventTestDb } from './event-test-db';
import { venueRankingRoutes } from '../src/venueRankings';
import { setEventVenues } from '../src/venues';
test('rankings persist per account, replace votes, remain private and invalidate changed candidate sets',async()=>{
 const db=new EventTestDb();try{
 await db.prepare("INSERT INTO events (id,ingest_key,title,slug,created_at,updated_at) VALUES ('e','e','Meetup','meetup','','')").run();
 await db.prepare("INSERT INTO venues (id,name) VALUES ('a','Alpha'),('b','Beta'),('c','Gamma')").run();
 const d1=db as unknown as D1Database;await setEventVenues(d1,'e',{candidate_venue_ids:['a','b']});
 const app=venueRankingRoutes(async(_env,req)=>{const id=req.headers.get('authorization');if(!id)throw new HTTPException(401);return {id}});
 const request=(suffix='',user?:string,order?:string[])=>app.fetch(new Request('https://example.test/e/venue-rankings'+suffix,{method:order?'PUT':'GET',headers:{'Content-Type':'application/json',...(user?{authorization:user}:{})},body:order?JSON.stringify({venue_ids:order,user_id:'victim'}):undefined}),{DB:d1} as Env);
 assert.equal((await request('',undefined,['a','b'])).status,401);
 assert.equal((await request('','alice',['a','a'])).status,400);
 assert.equal((await request('','alice',['a','b'])).status,200);
 assert.equal((await request('','bob',['b','a'])).status,200);
 assert.deepEqual((await (await request('','alice')).json() as any).venue_ids,['a','b']);
 assert.deepEqual((await (await request('','victim')).json() as any).venue_ids,[]);
 await request('','alice',['b','a']);const summary=await (await request('/public')).json() as any;
 assert.equal(summary.ballots_count,2);assert.equal(summary.venues[0].id,'b');assert.equal(summary.venues[0].points,4);assert.ok(!JSON.stringify(summary).includes('alice'));
 await setEventVenues(d1,'e',{candidate_venue_ids:['a','b','c']});assert.equal((await (await request('/public')).json() as any).ballots_count,0);assert.equal((await (await request('','alice')).json() as any).needs_update,true);
 await request('','alice',['c','b','a']);await setEventVenues(d1,'e',{candidate_venue_ids:['a','b','c'],confirmed_venue_id:'c'});
 assert.equal((await request('','alice',['a','b','c'])).status,409);
 }finally{db.close()}
});
