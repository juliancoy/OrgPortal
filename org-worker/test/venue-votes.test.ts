import test from 'node:test';
import assert from 'node:assert/strict';
import { HTTPException } from 'hono/http-exception';
import { EventTestDb } from './event-test-db';
import { venueVoteRoutes } from '../src/venueVotes';
import { setEventVenues } from '../src/venues';
test('votes are private per user and event, replace rather than accumulate, and close atomically', async () => {
 const db = new EventTestDb();
 try {
  await db.prepare("INSERT INTO events (id,ingest_key,title,slug,created_at,updated_at) VALUES ('e','e','Social','social','',''),('f','f','Panel','panel','','')").run();
  await db.prepare("INSERT INTO venues (id,name) VALUES ('a','Alpha'),('b','Beta')").run();
  const d1 = db as unknown as D1Database;
  await setEventVenues(d1,'e',{candidate_venue_ids:['a','b']}); await setEventVenues(d1,'f',{candidate_venue_ids:['a']});
  const app = venueVoteRoutes(async (_env,req) => {const id=req.headers.get('authorization');if(!id)throw new HTTPException(401);return {id}});
  const request=(path:string,user?:string,value?:unknown)=>app.fetch(new Request(`https://example.test/${path}`,{
   method:value===undefined?'GET':'PUT',headers:{'Content-Type':'application/json',...(user?{Authorization:user}:{})},
   body:value===undefined?undefined:JSON.stringify(typeof value==='object'?value:{value}),
  }),{DB:d1} as Env);
  assert.equal((await request('e/venue-votes/a',undefined,1)).status,401);
  for(const value of [2,'1',true,{value:1,user_id:'victim'}])assert.equal((await request('e/venue-votes/a','alice',value)).status,400);
  assert.equal((await request('e/venue-votes/missing','alice',1)).status,409);assert.equal((await request('missing/venue-votes/public')).status,404);
  await request('e/venue-votes/a','alice',1);await request('e/venue-votes/a','alice',1);await request('e/venue-votes/a','bob',-1);await request('f/venue-votes/a','alice',1);
  let summary=await(await request('e/venue-votes/public')).json() as any;
  assert.equal(summary.venues[0].upvotes,1);assert.equal(summary.venues[0].downvotes,1);assert.equal(summary.venues[0].score,0);
  assert.ok(!JSON.stringify(summary).includes('alice'));assert.ok(!JSON.stringify(summary).includes('user_id'));
  assert.deepEqual((await(await request('e/venue-votes','alice')).json() as any).votes,{a:1});assert.deepEqual((await(await request('e/venue-votes','victim')).json() as any).votes,{});
  await request('e/venue-votes/a','alice',-1);summary=await(await request('e/venue-votes/public')).json() as any;assert.equal(summary.venues[0].downvotes,2);assert.equal(summary.venues[0].score,-2);
  await request('e/venue-votes/a','alice',0);summary=await(await request('e/venue-votes/public')).json() as any;assert.equal(summary.venues[0].downvotes,1);
  await setEventVenues(d1,'e',{candidate_venue_ids:['b']});assert.equal((await request('e/venue-votes/a','bob',1)).status,409);assert.deepEqual((await(await request('e/venue-votes','bob')).json() as any).votes,{});
  await setEventVenues(d1,'e',{candidate_venue_ids:['b'],confirmed_venue_id:'b'});assert.equal((await request('e/venue-votes/b','alice',1)).status,409);assert.equal((await(await request('e/venue-votes/public')).json() as any).closed,true);
 }finally{db.close()}
});
