import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { HTTPException } from 'hono/http-exception';
import { memberMeetingRoutes, organizersMeetupTag, overlaps } from '../src/memberMeetings';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { resolvePortalTenant } from '../src/timebank';

test('interval conflicts allow meetings immediately before and after an event',()=>{
 const event={starts_at:'2026-10-20T22:00:00Z',ends_at:'2026-10-21T00:30:00Z'};
 assert.equal(overlaps('2026-10-20T21:30:00Z','2026-10-20T22:00:00Z',event),false);
 assert.equal(overlaps('2026-10-20T22:00:00Z','2026-10-20T22:30:00Z',event),true);
 assert.equal(overlaps('2026-10-21T00:30:00Z','2026-10-21T01:00:00Z',event),false);
});

test('member booking reuses availability, excludes meetup conflicts, requires publishing, and prevents double booking',async()=>{
 const db=new TimebankDatabase();
 try {
  for(const file of ['0002_org_event_directories.sql','0012_health_insurance.sql','0015_organization_iam.sql','0016_health_service_hosts_and_user_event_calendars.sql','0018_event_registrations.sql','0032_portal_tenant_org_slug.sql','0042_availability_polls.sql','0047_account_availability.sql','0060_member_meetings.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  db.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES ('lifetech','LifeTech','lifetech'); UPDATE portal_tenants SET organization_id='lifetech',home_org_slug='lifetech' WHERE hostname='medtech.social'");
  const tenant=await resolvePortalTenant(db.asD1(),new Request('https://medtech.social/'));
  for(const user of ['alice','bob','carol'])db.sqlite.prepare("INSERT INTO organization_memberships(organization_id,user_id,role) VALUES ('lifetech',?,'member')").run(user);
  const app=memberMeetingRoutes(async(_env,req)=>{const id=req.headers.get('authorization');if(!id)throw new HTTPException(401);return {id}});
  const req=(path:string,method='GET',body?:unknown,user='bob',host='medtech.social')=>app.fetch(new Request(`https://${host}${path}`,{method,headers:{...(user?{authorization:user}:{}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),{DB:db.asD1()} as Env);
  // Future half-hour, selected explicitly so this integration test is independent of the execution date.
  const start=new Date(Math.ceil((Date.now()+2*86400000)/1800000)*1800000).toISOString(),end=new Date(Date.parse(start)+1800000).toISOString();
  db.sqlite.prepare('INSERT INTO account_availability(user_id,slot,available) VALUES (?,?,1)').run('alice',start);
  assert.equal((await req('/alice/book','POST',{starts_at:start},'')).status,401);
  assert.equal((await req('/alice/book','POST',{starts_at:start},'outsider')).status,403);
  assert.equal((await req('/alice/book','POST',{starts_at:start})).status,409);
  assert.equal((await req('/preferences','PUT',{enabled:true,timezone:'UTC'},'alice')).status,200);
  // Missing monthly organizer calendar fails closed.
  assert.equal((await req('/alice/book','POST',{starts_at:start})).status,409);
  db.sqlite.prepare('INSERT INTO events(id,ingest_key,title,slug,host_org_id,tags,starts_at,ends_at) VALUES (?,?,?,?,?,?,?,?)')
   .run('organizers','portal:organizers','LifeTech organizers meetup','organizers','lifetech',JSON.stringify([organizersMeetupTag]),start,end);
  assert.equal((await req('/alice/book','POST',{starts_at:start})).status,409);
  const query=`/alice/slots?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  assert.deepEqual((await (await req(query)).json() as {slots:string[]}).slots,[]);
  // Ending at the booking start is safe and still establishes this month's meetup.
  db.sqlite.prepare('UPDATE events SET starts_at=?,ends_at=? WHERE id=?').run(new Date(Date.parse(start)-1800000).toISOString(),start,'organizers');
  assert.deepEqual((await (await req(query)).json() as {slots:string[]}).slots,[start]);
  db.sqlite.prepare('INSERT INTO events(id,ingest_key,title,slug,starts_at,ends_at) VALUES (?,?,?,?,?,?)').run('registered','portal:registered','Registered event','registered',start,end);
  db.sqlite.exec("INSERT INTO event_registrations(event_id,user_id) VALUES ('registered','alice')");
  assert.equal((await req('/alice/book','POST',{starts_at:start})).status,409);
  db.sqlite.exec("DELETE FROM event_registrations WHERE event_id='registered'");
  db.sqlite.prepare("INSERT INTO health_insurance_appointments(id,user_id,service_id,starts_at,ends_at,requested_at,updated_at) VALUES ('provider','alice','primary-care',?,?,?,?)").run(start,end,start,start);
  assert.equal((await req('/alice/book','POST',{starts_at:start})).status,409);
  db.sqlite.exec("UPDATE health_insurance_appointments SET status='cancelled' WHERE id='provider'");
  const bookings=await Promise.all([req('/alice/book','POST',{starts_at:start}),req('/alice/book','POST',{starts_at:start},'carol')]);
  assert.deepEqual(bookings.map(r=>r.status).sort(),[201,409]);
  const owner=await (await req('/','GET',undefined,'alice')).json() as {meetings:Array<{id:string;guest_user_id:string}>};
  assert.equal(owner.meetings.length,1);const booking=owner.meetings[0];
  const other=booking.guest_user_id==='bob'?'carol':'bob';
  assert.equal((await req(`/${booking.id}/cancel`,'POST',undefined,other)).status,404);
  assert.equal((await req(`/${booking.id}/cancel`,'POST',undefined,'alice','codecollective.us')).status,403);
  assert.equal((await req(`/${booking.id}/cancel`,'POST',undefined,'alice')).status,200);
  assert.equal((await req('/alice/book','POST',{starts_at:start})).status,201);
  assert.equal((await req('/preferences','PUT',{enabled:false,timezone:'UTC'},'alice')).status,200);
  assert.deepEqual((await (await req(query)).json() as {slots:string[]}).slots,[]);
  assert.equal((db.sqlite.prepare('SELECT count(*) n FROM member_meetings WHERE tenant_id=?').get(tenant.id) as {n:number}).n,2);
 }finally{db.sqlite.close()}
});
