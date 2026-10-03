import test from 'node:test';
import assert from 'node:assert/strict';
import { HTTPException } from 'hono/http-exception';
import { EventTestDb } from './event-test-db';
import { venueRoutes, eventVenues, setEventVenues } from '../src/venues';
test('venues are reusable, contacts are private, and edits require live ownership',async()=>{
 const db=new EventTestDb();try{
 const app=venueRoutes(async(_env,req)=>{const id=req.headers.get('authorization');if(!id)throw new HTTPException(401);return {id}},async(_env,user,row)=>{if(row.created_by_user_id!==user.id)throw new HTTPException(403)});
 const req=(path:string,method='GET',body?:unknown,user?:string)=>app.fetch(new Request('https://example.test'+path,{method,headers:{'Content-Type':'application/json',...(user?{authorization:user}:{})},body:body===undefined?undefined:JSON.stringify(body)}),{DB:db} as unknown as Env);
 assert.equal((await req('/','POST',{name:'Hall'})).status,401);
 assert.equal((await req('/','POST',{name:'Hall',website:'javascript:alert(1)'},'alice')).status,400);
 const r=await req('/','POST',{name:'Hall',address:'1 Main St',contact_email:'private@example.test',notes:'Private organizer notes',created_by_user_id:'bob'},'alice');assert.equal(r.status,201);const {id}=await r.json() as {id:string};
 const publicData=JSON.stringify(await (await req('/public')).json());assert.ok(publicData.includes('Hall'));assert.ok(!publicData.includes('private@example'));assert.ok(!publicData.includes('Private organizer'));
 assert.equal((await req(`/${id}/manage`,'GET',undefined,'bob')).status,403);
 assert.equal((await req(`/${id}`,'PATCH',{name:'Changed'},'bob')).status,403);
 assert.equal((await req(`/${id}`,'PATCH',{name:'Changed'},'alice')).status,200);
 assert.equal((await req(`/${id}`,'PATCH',{image_url:'javascript:alert(1)'},'alice')).status,400);
 assert.equal((await req(`/${id}`,'PATCH',{research_url:'https://user:secret@example.com/'},'alice')).status,400);
 assert.equal((await req(`/${id}`,'PATCH',{researched_at:'yesterday'},'alice')).status,400);
 assert.equal((await req(`/${id}`,'PATCH',{researched_at:'2026-02-31'},'alice')).status,400);
 const details={description:'Community hall',image_url:'https://example.com/hall.jpg',image_source_url:'https://example.com/hall',image_credit:'Hall operator',research_url:'https://example.com/rentals',researched_at:'2026-10-03'};
 assert.equal((await req(`/${id}`,'PATCH',details,'alice')).status,200);
 const enriched=await (await req(`/public/${id}`)).json() as Record<string,unknown>;
 for(const [key,value] of Object.entries(details))assert.equal(enriched[key],value);
 assert.ok(!('contact_email' in enriched));assert.ok(!('notes' in enriched));
 assert.equal((await req(`/${id}/manage`,'GET',undefined,'alice')).status,200);
 }finally{db.close()}
});
test('events distinguish candidates from one confirmed venue, reuse records, and reject invalid replacements atomically',async()=>{
 const db=new EventTestDb();try{
 for(const id of ['event-one','event-two'])await db.prepare("INSERT INTO events (id,ingest_key,title,slug,created_at,updated_at) VALUES (?,?,?,?,'','')").bind(id,id,id,id).run();
 await db.prepare("INSERT INTO venues (id,name,address) VALUES ('hall','Hall','1 Main St'),('park','Park','2 Green St')").run();
 const d1=db as unknown as D1Database;
 await setEventVenues(d1,'event-one',{candidate_venue_ids:['hall','park'],confirmed_venue_id:null});assert.equal((await eventVenues(d1,'event-one')).filter(v=>v.event_status==='candidate').length,2);
 assert.equal((await db.prepare("SELECT location FROM events WHERE id = 'event-one'").first() as {location:unknown}).location,null);
 await setEventVenues(d1,'event-one',{candidate_venue_ids:['hall','park'],confirmed_venue_id:'hall'});
 await setEventVenues(d1,'event-two',{candidate_venue_ids:['hall'],confirmed_venue_id:null});
 assert.equal((await db.prepare("SELECT location FROM events WHERE id = 'event-one'").first() as {location:string}).location,'Hall · 1 Main St');
 await assert.rejects(()=>setEventVenues(d1,'event-one',{candidate_venue_ids:['missing'],confirmed_venue_id:null}));assert.equal((await eventVenues(d1,'event-one')).length,2);
 await db.prepare("UPDATE venues SET status = 'inactive' WHERE id = 'park'").run();await assert.rejects(()=>setEventVenues(d1,'event-two',{candidate_venue_ids:['park']}));
 await setEventVenues(d1,'event-one',{candidate_venue_ids:[],confirmed_venue_id:null});assert.equal((await eventVenues(d1,'event-one')).length,0);assert.equal((await eventVenues(d1,'event-two')).length,1);
 }finally{db.close()}
});
