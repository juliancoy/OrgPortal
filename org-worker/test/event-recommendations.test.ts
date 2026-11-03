import test from 'node:test';
import assert from 'node:assert/strict';
import { HTTPException } from 'hono/http-exception';
import { EventTestDb } from './event-test-db';
import { eventRecommendationRoutes } from '../src/eventRecommendations';

function fixture() {
 const db=new EventTestDb(`CREATE TABLE event_registrations(event_id TEXT,user_id TEXT);
 CREATE TABLE organization_follows(user_id TEXT,organization_id TEXT);`);
 const app=eventRecommendationRoutes(async (_env,request)=>{
  const id=request.headers.get('Authorization');
  if(id!=='alice'&&id!=='bob')throw new HTTPException(401);
  return {id};
 },async (_env,_request,row:{id:string})=>({id:row.id}));
 async function event(id:string,org:string|null,start='2099-01-01',host:string|null=null) {
  await db.prepare(`INSERT INTO events(id,ingest_key,title,slug,host_org_id,starts_at,host_user_id,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,'','')`).bind(id,id,id,id,org,start,host).run();
 }
 async function request(user='',limit=500,offset=0) {
  return app.request(`/events/recommended?limit=${limit}&offset=${offset}&user_id=bob`,{headers:user?{Authorization:user}:{}},{DB:db as unknown as D1Database});
 }
 async function ids(user='',limit=500) {return (await (await request(user,limit)).json() as {id:string}[]).map(row=>row.id);}
 return {db,event,request,ids};
}

test('live account signals rank before limit, stay private and place past events last',async()=>{
 const f=fixture();try {
  await f.db.prepare("INSERT INTO organizations(id,name,slug) VALUES('followed','Followed','followed'),('member','Member','member'),('other','Other','other')").run();
  await f.event('early','other');await f.event('followed','followed','2099-06-01');
  await f.event('member','member','2099-05-01');await f.event('registered','other','2099-07-01');
  await f.event('hosted',null,'2099-08-01','alice');await f.event('past','followed','2000-01-01');
  await f.db.prepare("INSERT INTO organization_follows VALUES('alice','followed')").run();
  await f.db.prepare("INSERT INTO organization_memberships VALUES('member','alice','member','active')").run();
  await f.db.prepare("INSERT INTO event_registrations VALUES('registered','alice')").run();
  assert.deepEqual(await f.ids('alice'),['registered','hosted','followed','member','early','past']);
  assert.deepEqual(await f.ids('alice',1),['registered']);
  assert.deepEqual(await f.ids('bob'),await f.ids());
  const response=await f.request('alice');
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.equal(response.headers.get('Vary'),'Authorization');
  assert.ok(!JSON.stringify(await response.json()).match(/alice|relevance|score|user_id/));
  assert.equal((await f.request('invalid')).status,401);
  await f.db.prepare("DELETE FROM organization_follows WHERE user_id='alice'").run();
  await f.db.prepare("DELETE FROM event_registrations WHERE user_id='alice'").run();
  await f.db.prepare("UPDATE organization_memberships SET status='inactive' WHERE user_id='alice'").run();
  assert.deepEqual(await f.ids('alice'),['hosted','early','member','followed','registered','past']);
 }finally{f.db.close();}
});

test('recent repeat host participation boosts discovery; expired history and other accounts do not',async()=>{
 const f=fixture();try {
  await f.event('early',null);await f.event('repeat',null,'2099-06-01','organizer');
  await f.event('old',null,new Date(Date.now()-86400000).toISOString(),'organizer');
  await f.event('expired',null,'2000-01-01','expired-host');await f.event('expired-next',null,'2099-05-01','expired-host');
  await f.db.prepare("INSERT INTO event_registrations VALUES('old','alice'),('expired','alice')").run();
  assert.equal((await f.ids('alice',1))[0],'repeat');
  assert.equal((await f.ids('bob',1))[0],'early');assert.equal((await f.ids('',1))[0],'early');
  await f.db.prepare("DELETE FROM event_registrations WHERE user_id='alice'").run();
  assert.equal((await f.ids('alice',1))[0],'early');
 }finally{f.db.close();}
});

test('guest ordering uses platform activity, chronological ties, ongoing and undated events',async()=>{
 const f=fixture();try {
  await f.event('early',null);await f.event('active','org-one','2099-09-01');await f.event('popular',null,'2099-08-01');
  await f.event('undated',null);await f.db.prepare("UPDATE events SET starts_at=NULL WHERE id='undated'").run();
  await f.db.prepare("INSERT INTO event_registrations VALUES('popular','someone'),('popular','another')").run();
  await f.event('ongoing',null,new Date(Date.now()-3600000).toISOString());
  await f.db.prepare("UPDATE events SET ends_at=? WHERE id='ongoing'").bind(new Date(Date.now()+3600000).toISOString()).run();
  const ids=await f.ids();assert.deepEqual(ids.slice(0,2),['popular','active']);
  assert.ok(ids.indexOf('ongoing')<ids.indexOf('early'));assert.equal(ids.at(-1),'undated');
 }finally{f.db.close();}
});

test('recommendations expose bounded advancing pages with deterministic ties',async()=>{
 const f=fixture();try {
  for(let n=0;n<102;n++)await f.event(`event-${String(n).padStart(3,'0')}`,null)
  const first=await (await f.request('',25,0)).json() as {id:string}[]
  const next=await (await f.request('',25,25)).json() as {id:string}[]
  assert.equal(first.length,25);assert.equal(next.length,25)
  assert.equal(first[0].id,'event-000');assert.equal(next[0].id,'event-025')
  assert.equal(new Set([...first,...next].map(e=>e.id)).size,50)
  assert.equal((await (await f.request('',25,100)).json() as unknown[]).length,2)
  assert.deepEqual(await (await f.request('',25,102)).json(),[])
  assert.equal((await (await f.request('',500,0)).json() as unknown[]).length,100)
  const defaults=await f.request('',0,-10)
  assert.equal((await defaults.json() as unknown[]).length,25)
 }finally{f.db.close()}
})
