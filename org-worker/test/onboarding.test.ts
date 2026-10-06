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
  const completed:any=await (await req('/onboarding')).json();
  assert.ok(completed.completed_at);
  const stored=db.sqlite.prepare('SELECT acknowledgements,availability_saved_at,completed_at FROM onboarding_enrollments WHERE tenant_id=? AND user_id=?').get(completed.tenant_id,'alice')!;
  assert.equal(stored.completed_at,completed.completed_at);
  assert.equal(stored.availability_saved_at,completed.availability_saved_at);
  assert.deepEqual(JSON.parse(stored.acknowledgements as string),completed.acknowledgements);
  // A fresh API instance restores progress without previous request or browser state.
  const restarted=new Hono<{Bindings:Env}>();
  restarted.route('/onboarding',onboardingRoutes(auth));
  restarted.route('/tasks',userTaskRoutes(auth));
  const freshRequest=(path:string,user='alice')=>restarted.fetch(new Request(`https://medtech.social${path}`,{headers:{authorization:user}}),env);
  const restored:any=await (await freshRequest('/onboarding')).json();
  assert.equal(restored.completed_at,completed.completed_at);
  assert.equal(restored.availability_saved_at,completed.availability_saved_at);
  assert.deepEqual(restored.acknowledgements,completed.acknowledgements);
  assert.equal((await (await freshRequest('/tasks')).json() as any).tasks.length,0);
  assert.equal((await (await freshRequest('/onboarding','bob')).json() as any).completed_at,null);
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

 test('LifeTech removes conduct and governance steps, retires their tasks, and preserves confirmations',async()=>{
 const db=new TimebankDatabase();
 try {
  db.sqlite.exec("ALTER TABLE portal_tenants ADD COLUMN feature_config TEXT NOT NULL DEFAULT '{}'");
  for(const file of ['0042_availability_polls.sql','0046_user_tasks.sql','0047_account_availability.sql','0051_onboarding.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  db.sqlite.exec(`UPDATE portal_tenants SET hostname='lifetech.fyi',home_org_slug='lifetech',feature_config='{"onboarding":{"enabled":true}}' WHERE hostname='medtech.social'`);
  const tenant=await resolvePortalTenant(db.asD1(),new Request('https://lifetech.fyi/'));
  const confirmed='2026-10-03T12:00:00Z';
  db.sqlite.prepare('INSERT INTO onboarding_enrollments(tenant_id,user_id,start_date,end_date,acknowledgements,availability_saved_at) VALUES (?,?,?,?,?,?)').run(tenant.id,'alice','2026-10-03','2026-11-03',JSON.stringify({constitution:confirmed,participation:confirmed}),confirmed);
  for(const step of ['communications','meetings'])db.sqlite.prepare("INSERT INTO user_tasks(id,tenant_id,user_id,created_by_user_id,kind,entity_id,title) VALUES (?,?,'alice','alice','personal',?,?)").run(step,tenant.id,`onboarding:v1:${step}`,step);
  const app=new Hono<{Bindings:Env}>();const auth=async()=>({id:'alice'});
  app.route('/onboarding',onboardingRoutes(auth));app.route('/tasks',userTaskRoutes(auth));
  const request=(path:string,method='GET')=>app.fetch(new Request(`https://lifetech.fyi${path}`,{method,headers:{'content-type':'application/json'},body:method==='POST'?JSON.stringify({acknowledged:true}):undefined}),{DB:db.asD1()} as Env);
  const data:any=await (await request('/onboarding')).json();
  assert.deepEqual(data.steps.map((step:any)=>step.id),['constitution','participation']);
  assert.deepEqual(data.acknowledgements,{constitution:confirmed,participation:confirmed});
  assert.ok(data.completed_at);
  assert.deepEqual((await (await request('/tasks')).json() as any).tasks,[]);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM user_tasks WHERE entity_id IN ('onboarding:v1:communications','onboarding:v1:meetings')").get()!.n,0);
  assert.equal((await request('/onboarding/steps/meetings','POST')).status,400);
 } finally {db.sqlite.close()}
});

test('verified personal identity restores and merges onboarding and uses the same canonical person for private tasks and poll ownership',async()=>{
 const db=new TimebankDatabase();
 try {
  db.sqlite.exec("ALTER TABLE portal_tenants ADD COLUMN feature_config TEXT NOT NULL DEFAULT '{}'");
  for(const file of ['0042_availability_polls.sql','0046_user_tasks.sql','0047_account_availability.sql','0051_onboarding.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  db.sqlite.exec(`UPDATE portal_tenants SET feature_config='{"onboarding":{"enabled":true}}' WHERE hostname='medtech.social'`);
  const tenant=await resolvePortalTenant(db.asD1(),new Request('https://medtech.social/'));
  const confirmed='2026-10-03T12:00:00Z';
  const insert=db.sqlite.prepare('INSERT INTO onboarding_enrollments(tenant_id,user_id,start_date,end_date,acknowledgements,availability_saved_at) VALUES (?,?,?,?,?,?)');
  insert.run(tenant.id,'owner','2026-10-03','2026-11-03',JSON.stringify({constitution:confirmed}),confirmed);
  insert.run(tenant.id,'member','2026-10-03','2026-11-03',JSON.stringify({participation:confirmed,communications:confirmed,meetings:confirmed}),null);
  db.sqlite.prepare("INSERT INTO account_availability(user_id,slot,available,updated_at) VALUES ('owner','2026-10-05T13:00:00.000Z',1,'2026-10-03 12:00:00'),('member','2026-10-05T13:00:00.000Z',0,'2026-10-04 12:00:00')").run();
  for(const user of ['owner','member'])db.sqlite.prepare("INSERT INTO user_tasks(id,tenant_id,user_id,created_by_user_id,kind,title) VALUES (?,?,?,?,'personal',?)").run(`${user}-task`,tenant.id,user,user,`${user} only`);
  const auth=async(_env:Env,request:Request)=>{const id=request.headers.get('authorization')!;return {id:id==='member'?'owner':id,account_id:id}};
  const app=new Hono<{Bindings:Env}>();
  app.route('/onboarding',onboardingRoutes(auth));app.route('/tasks',userTaskRoutes(auth));app.route('/availability',availabilityRoutes(auth));
  const req=(path:string,method='GET',body?:unknown,user='member')=>app.fetch(new Request(`https://medtech.social${path}`,{method,headers:{authorization:user,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),{DB:db.asD1()} as Env);
  const restored:any=await (await req('/onboarding')).json();
  assert.equal(restored.user_id,'owner');assert.ok(restored.completed_at);
  assert.equal(Object.keys(restored.acknowledgements).length,4);
  assert.deepEqual((await (await req('/onboarding','GET',undefined,'owner')).json() as any).acknowledgements,restored.acknowledgements);
  assert.deepEqual((await (await req('/tasks')).json() as any).tasks.map((t:any)=>t.id),['owner-task']);
  assert.equal((await req('/tasks/owner-task/complete','POST')).status,200);
  assert.equal((await (await req('/onboarding','GET',undefined,'stranger')).json() as any).completed_at,null);
  const calendar:any=await (await req('/onboarding/availability?timezone=America%2FNew_York')).json();
  assert.ok(!calendar.selected.includes('2026-10-05T13:00:00.000Z'));
  assert.equal((await req('/onboarding/availability','PUT',{timezone:'America/New_York',slots:['2026-10-05T13:00:00.000Z'],reviewed:true})).status,200);
  const again:any=await (await req('/onboarding/availability?timezone=America%2FNew_York')).json();
  assert.ok(again.selected.includes('2026-10-05T13:00:00.000Z'));
  const ownerWeek:any=await (await req('/onboarding/availability?timezone=America%2FNew_York','GET',undefined,'owner')).json();
  assert.deepEqual(ownerWeek.selected,again.selected);
  assert.equal((await (await req('/onboarding')).json() as any).completed_at,restored.completed_at);
  const poll:any=await (await req('/availability','POST',{title:'Owner poll',timezone:'UTC',slots:['2026-10-05T13:00:00.000Z']},'owner')).json();
  assert.equal((await req(`/availability/${poll.id}`,'PATCH',{closed:true})).status,200);
 }finally{db.sqlite.close()}
});
