import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { monthSlots, nextMonth, onboardingRoutes, onboardingSteps } from '../src/onboarding';
import { availabilityRoutes } from '../src/availability';
import { userTaskRoutes } from '../src/userTasks';
import { resolvePortalTenant } from '../src/timebank';

test('month bounds clamp short months and preserve local dates across DST',()=>{
 assert.equal(nextMonth('2026-01-31'),'2026-02-28');
 assert.equal(nextMonth('2026-12-03'),'2027-01-03');
 const slots=monthSlots('2026-10-03','2026-11-03','America/New_York');
 assert.equal(slots.length,31*48+2);
 assert.equal(slots[0],'2026-10-03T04:00:00.000Z');
 assert.equal(slots.at(-1),'2026-11-03T04:30:00.000Z');
 assert.throws(()=>monthSlots('2026-10-03','2026-11-03','bad'));
});
test('onboarding enrolls once, isolates tenants and users, and requires all steps plus a reviewed typical week',async()=>{
 const db=new TimebankDatabase();
 db.sqlite.exec("ALTER TABLE portal_tenants ADD COLUMN feature_config TEXT NOT NULL DEFAULT '{}'");
 for(const file of ['0042_availability_polls.sql','0046_user_tasks.sql','0047_account_availability.sql','0051_onboarding.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 db.sqlite.exec(`UPDATE portal_tenants SET feature_config='{"onboarding":{"enabled":true}}' WHERE hostname='medtech.social'`);
 const auth=async(_env:Env,req:Request)=>{const id=req.headers.get('authorization');if(!id)throw new HTTPException(401);return {id}};
 const app=new Hono<{Bindings:Env}>();app.route('/onboarding',onboardingRoutes(auth));app.route('/tasks',userTaskRoutes(auth));
 const env={DB:db.asD1()} as Env;
 const req=(path:string,method='GET',body?:unknown,user='alice',host='medtech.social')=>app.fetch(new Request(`https://${host}${path}`,{method,headers:{...(user?{authorization:user}:{}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env);
 try{
  assert.equal((await req('/onboarding','GET',undefined,'')).status,401);
  assert.deepEqual(await (await req('/onboarding','GET',undefined,'alice','codecollective.us')).json(),{enabled:false});
  const initial:any=await (await req('/onboarding')).json();assert.equal(initial.enabled,true);assert.equal(initial.completed_at,null);
  await req('/onboarding');
  const queue:any=await (await req('/tasks')).json();assert.equal(queue.tasks.length,5);assert.equal(queue.tasks[0].href,'/onboarding#availability');
  assert.match(queue.tasks[0].title,/meeting availability/);
  assert.deepEqual(queue.tasks.slice(1).map((t:any)=>t.href),onboardingSteps.map(s=>`/onboarding#${s.id}`));
  assert.equal((await (await req('/tasks')).json() as any).tasks.length,5);
  assert.equal((await req(`/tasks/${queue.tasks[0].id}/complete`,'POST')).status,409);
  for(const [index,step] of onboardingSteps.entries()){
   assert.equal((await req(`/onboarding/steps/${step.id}`,'POST',{acknowledged:true})).status,200);
   const pending:any=await (await req('/tasks')).json();
   assert.equal(pending.tasks.length,4-index);
   assert.ok(!pending.tasks.some((t:any)=>t.href===`/onboarding#${step.id}`));
  }
  assert.equal((await req('/onboarding/steps/availability','POST',{acknowledged:true})).status,400);
  assert.equal((await (await req('/onboarding')).json() as any).completed_at,null);
  assert.equal((await req('/onboarding/availability','PUT',{timezone:'America/New_York',slots:[],reviewed:false})).status,400);
  assert.equal((await req('/onboarding/availability','PUT',{timezone:'UTC',slots:['2000-01-01T00:00:00.000Z'],reviewed:true})).status,400);
  const calendar:any=await (await req('/onboarding/availability?timezone=America%2FNew_York')).json();
  assert.ok(calendar.slots.length>=7*48-2 && calendar.slots.length<=7*48+2);
  assert.equal((Date.parse(calendar.end)-Date.parse(calendar.start))/86400000,7);
  assert.equal((await req('/onboarding/availability','PUT',{timezone:'America/New_York',slots:[new Date(Date.parse(calendar.slots.at(-1))+1800000).toISOString()],reviewed:true})).status,400);
  assert.equal((await req('/onboarding/availability','PUT',{timezone:'America/New_York',slots:[],reviewed:true})).status,200);
  assert.ok((await (await req('/onboarding')).json() as any).completed_at);
  assert.equal((await (await req('/tasks')).json() as any).tasks.length,0);
  const bob:any=await (await req('/onboarding','GET',undefined,'bob')).json();assert.equal(bob.completed_at,null);assert.equal(bob.availability_saved_at,null);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM account_availability WHERE user_id='alice' AND available=0").get()!.n,calendar.slots.length);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM account_availability WHERE user_id='bob'").get()!.n,0);
 }finally{db.sqlite.close()}
});

test('existing onboarding progress replaces the aggregate task without reopening completed steps',async()=>{
 const db=new TimebankDatabase();
 db.sqlite.exec("ALTER TABLE portal_tenants ADD COLUMN feature_config TEXT NOT NULL DEFAULT '{}'");
 for(const file of ['0042_availability_polls.sql','0046_user_tasks.sql','0047_account_availability.sql','0051_onboarding.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 db.sqlite.exec(`UPDATE portal_tenants SET feature_config='{"onboarding":{"enabled":true}}' WHERE hostname='medtech.social'`);
 const auth=async(_env:Env,req:Request)=>({id:req.headers.get('authorization')!});
 const app=new Hono<{Bindings:Env}>();app.route('/tasks',userTaskRoutes(auth));
 const env={DB:db.asD1()} as Env;
 try{
  const tenantRow=await resolvePortalTenant(db.asD1(),new Request('https://medtech.social/tasks'));
  const tenant=tenantRow.id;
  db.sqlite.prepare('INSERT INTO onboarding_enrollments(tenant_id,user_id,start_date,end_date,acknowledgements,availability_saved_at) VALUES (?,?,?,?,?,?)').run(tenant,'alice','2026-10-03','2026-11-03','{"constitution":"2026-10-03T12:00:00Z"}','2026-10-03T12:00:00Z');
  const insert=db.sqlite.prepare("INSERT INTO user_tasks(id,tenant_id,user_id,created_by_user_id,kind,entity_id,title) VALUES (?,?,'alice','alice','personal',?,?)");
  insert.run('legacy',tenant,'onboarding:v1','Complete onboarding');
  insert.run('calendar',tenant,`availability-calendar:${tenantRow.organization_id}`,'Enter availability');
  db.sqlite.prepare("INSERT INTO user_tasks(id,tenant_id,user_id,created_by_user_id,kind,title) VALUES ('personal',?,'alice','alice','personal','My own task')").run(tenant);
  const read=async(user='alice')=>(await (await app.fetch(new Request('https://medtech.social/tasks',{headers:{authorization:user}}),env)).json()) as {tasks:Array<{id:string;href:string}>};
  assert.deepEqual((await read()).tasks.map(t=>t.href),['/onboarding#participation','/onboarding#communications','/onboarding#meetings',null]);
  assert.equal((await read()).tasks.length,4);
  assert.equal((db.sqlite.prepare("SELECT status FROM user_tasks WHERE id='legacy'").get() as {status:string}).status,'completed');
  assert.equal((await read('bob')).tasks.length,5);
  assert.equal((await read()).tasks.length,4);
  const rows=db.sqlite.prepare("SELECT id FROM user_tasks WHERE user_id='alice' AND entity_id LIKE 'onboarding:v1:%'").all() as Array<{id:string}>;
  for(const task of rows)assert.equal((await app.fetch(new Request(`https://medtech.social/tasks/${task.id}/complete`,{method:'POST',headers:{authorization:'alice'}}),env)).status,409);
 }finally{db.sqlite.close()}
});


test('onboarding availability feeds scheduling polls across DST with private suggestions and explicit confirmation',async()=>{
 const db=new TimebankDatabase();
 try {
  db.sqlite.exec("ALTER TABLE portal_tenants ADD COLUMN feature_config TEXT NOT NULL DEFAULT '{}'");
  for(const file of ['0042_availability_polls.sql','0046_user_tasks.sql','0047_account_availability.sql','0051_onboarding.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  db.sqlite.exec(`UPDATE portal_tenants SET feature_config='{"onboarding":{"enabled":true}}' WHERE hostname='medtech.social'`);
  const tenant=await resolvePortalTenant(db.asD1(),new Request('https://medtech.social/'));
  db.sqlite.prepare('INSERT INTO onboarding_enrollments(tenant_id,user_id,start_date,end_date) VALUES (?,?,?,?)').run(tenant.id,'alice','2026-10-03','2026-11-03');
  const auth=async(_env:Env,req:Request)=>{const id=req.headers.get('authorization');if(!id)throw new HTTPException(401);return {id}};
  const app=new Hono<{Bindings:Env}>();
  app.route('/onboarding',onboardingRoutes(auth));app.route('/availability',availabilityRoutes(auth));
  const req=(path:string,method='GET',body?:unknown,user='alice')=>app.fetch(new Request(`https://medtech.social${path}`,{method,headers:{...(user?{authorization:user}:{}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),{DB:db.asD1()} as Env);
  const saved='2026-10-05T13:00:00.000Z',future='2026-11-02T14:00:00.000Z',unavailable='2026-11-02T14:30:00.000Z';
  assert.equal((await req('/onboarding/availability','PUT',{timezone:'America/New_York',slots:[saved],reviewed:true})).status,200);
  const {id}=await (await req('/availability','POST',{title:'Meeting after onboarding',timezone:'America/New_York',slots:[future,unavailable]})).json() as {id:string};
  const mine=await (await req(`/availability/${id}/me?timezone=America%2FNew_York`)).json() as {slots:string[];suggested_slots:string[];has_response:boolean};
  assert.deepEqual(mine.slots,[future]);assert.deepEqual(mine.suggested_slots,[future]);assert.equal(mine.has_response,false);
  const other=await (await req(`/availability/${id}/me`,'GET',undefined,'bob')).json() as {slots:string[]};assert.deepEqual(other.slots,[]);
  assert.equal((await req(`/availability/${id}/me`,'GET',undefined,'')).status,401);
  const overlap=async()=>await (await req(`/availability/${id}`,'GET',undefined,'')).json() as {participants:number;counts:Record<string,number>};
  assert.equal((await overlap()).participants,0);assert.equal((await overlap()).counts[future],0);
  assert.equal((await req(`/availability/${id}/me`,'PUT',{slots:mine.slots})).status,200);
  assert.equal((await overlap()).participants,1);assert.equal((await overlap()).counts[future],1);assert.equal((await overlap()).counts[unavailable],0);
  assert.equal((await req(`/availability/${id}/me`,'PUT',{slots:[]})).status,200);
  assert.equal((await overlap()).counts[future],0);
  assert.deepEqual((await (await req(`/availability/${id}/me`)).json() as {slots:string[]}).slots,[]);
 }finally{db.sqlite.close()}
});
