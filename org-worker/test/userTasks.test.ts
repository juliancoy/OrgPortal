import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { availabilityRoutes } from '../src/availability';
import { userTaskRoutes } from '../src/userTasks';
import { TimebankDatabase } from './helpers/timebankDatabase';
const slots=['2026-10-10T13:00:00.000Z','2026-10-10T13:30:00.000Z'];
function fixture(){
 const db=new TimebankDatabase();
 for(const file of ['0042_availability_polls.sql','0046_user_tasks.sql','0047_account_availability.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 for(const id of ['alice','bob','carol'])db.sqlite.prepare('INSERT INTO user_contact_pages (id,user_id,user_name,slug,enabled) VALUES (?,?,?,?,1)').run(id,id,id,id);
 const auth=async(_env:Env,req:Request)=>{const id=req.headers.get('authorization');if(!id)throw new HTTPException(401);return {id}};
 const app=new Hono<{Bindings:Env}>();app.route('/availability',availabilityRoutes(auth));app.route('/tasks',userTaskRoutes(auth));
 const request=(path:string,method='GET',body?:unknown,user='alice',host='medtech.social')=>app.fetch(new Request(`https://${host}${path}`,{method,headers:{...(user?{authorization:user}:{}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),{DB:db.asD1()} as Env);
 const queue=async(user:string,host='medtech.social')=>(await (await request('/tasks','GET',undefined,user,host)).json() as {tasks:Array<{id:string;kind:string;href:string|null}>}).tasks;
 return {db,request,queue};
}
test('personal tasks persist through notification reads and isolate users and tenants',async()=>{
 const {db,request,queue}=fixture();try{
 assert.equal((await request('/tasks','GET',undefined,'')).status,401);
 assert.equal((await request('/tasks','POST',{title:' '},'bob')).status,400);
 const created=await request('/tasks','POST',{title:'Read agenda',user_id:'carol'},'bob');assert.equal(created.status,201);const {id}=await created.json() as {id:string};
 assert.equal((await queue('bob')).length,1);assert.equal((await queue('carol')).length,0);assert.equal((await queue('bob','codecollective.us')).length,0);
 db.sqlite.prepare("UPDATE user_notifications SET status = 'read' WHERE user_id = 'bob'").run();assert.equal((await queue('bob')).length,1);
 assert.equal((await request(`/tasks/${id}/complete`,'POST',undefined,'carol')).status,404);
 assert.equal((await request(`/tasks/${id}/complete`,'POST',undefined,'bob','codecollective.us')).status,404);
 assert.equal((await request(`/tasks/${id}/complete`,'POST',undefined,'bob')).status,200);assert.equal((await request(`/tasks/${id}/complete`,'POST',undefined,'bob')).status,200);assert.equal((await queue('bob')).length,0);
 }finally{db.sqlite.close()}
});
test('poll invitations assign idempotent tasks and saved responses complete them privately',async()=>{
 const {db,request,queue}=fixture();try{
 const {id}=await (await request('/availability','POST',{title:'Meetup',timezone:'UTC',slots})).json() as {id:string};
 const invite=(ids:unknown,user='alice',host='medtech.social')=>request(`/availability/${id}/invites`,'POST',{user_ids:ids},user,host);
 assert.equal((await invite(['bob'],'carol')).status,403);assert.equal((await invite(['bob'],'alice','codecollective.us')).status,404);
 assert.equal((await invite(['missing','bob'])).status,400);assert.equal((await queue('bob')).length,0);
 assert.equal((await invite(['bob','bob'])).status,200);assert.equal((await invite(['bob'])).status,200);
 const tasks=await queue('bob');assert.equal(tasks.length,1);assert.equal(tasks[0].href,`/availability/${id}`);
 assert.equal((await request(`/tasks/${tasks[0].id}/complete`,'POST',undefined,'bob')).status,409);
 const summary=await (await request(`/availability/${id}`,'GET',undefined,'')).json() as {invited_count:number};assert.equal(summary.invited_count,1);assert.ok(!JSON.stringify(summary).includes('bob'));
 assert.equal((await request(`/availability/${id}/invites`,'GET',undefined,'bob')).status,403);
 const polls=await (await request('/availability','GET',undefined,'bob')).json() as {polls:Array<{id:string}>};assert.equal(polls.polls[0].id,id);
 assert.equal((await request(`/availability/${id}/me`,'PUT',{slots:['bad']},'bob')).status,400);assert.equal((await queue('bob')).length,1);
 assert.equal((await request(`/availability/${id}/me`,'PUT',{slots:[]},'bob')).status,200);assert.equal((await queue('bob')).length,0);
 assert.equal((await invite(['bob'])).status,200);assert.equal((await queue('bob')).length,0);
 await request(`/availability/${id}/me`,'PUT',{slots},'carol');await invite(['carol']);assert.equal((await queue('carol')).length,0);
 const roster=await (await request(`/availability/${id}/invites`)).json() as {invites:Array<{responded:number}>};assert.ok(roster.invites.every(row=>row.responded===1));
 }finally{db.sqlite.close()}
});
test('closure resolves poll tasks; reopening restores only unanswered invitations',async()=>{
 const {db,request,queue}=fixture();try{
 const {id}=await (await request('/availability','POST',{title:'Meetup',timezone:'UTC',slots})).json() as {id:string};
 await request(`/availability/${id}/invites`,'POST',{user_ids:['bob','carol']});await request(`/availability/${id}/me`,'PUT',{slots},'carol');
 await request(`/availability/${id}`,'PATCH',{closed:true});assert.equal((await queue('bob')).length,0);
 assert.equal((await request(`/availability/${id}/invites`,'POST',{user_ids:['alice']})).status,409);
 assert.equal((await request(`/availability/${id}/me`,'PUT',{slots},'bob')).status,409);
 await request(`/availability/${id}`,'PATCH',{closed:false});assert.equal((await queue('bob')).length,1);assert.equal((await queue('carol')).length,0);
 }finally{db.sqlite.close()}
});

test('organization calendar task links to availability and completes only for the saving account and tenant',async()=>{
 const {db,request,queue}=fixture();try{
 const insert=db.sqlite.prepare("INSERT INTO user_tasks(id,tenant_id,user_id,created_by_user_id,kind,entity_id,title) VALUES (?,? ,?,'alice','personal','availability-calendar:org','Fill out your availability calendar')");
 insert.run('bob-calendar','baltimore-medtech','bob');insert.run('carol-calendar','baltimore-medtech','carol');insert.run('bob-other-tenant','code-collective','bob');
 assert.equal((await queue('bob'))[0].href,'/availability');
 const {id}=await (await request('/availability','POST',{title:'Calendar',timezone:'UTC',slots})).json() as {id:string};
 assert.equal((await request(`/availability/${id}/me`,'PUT',{slots:['bad']},'bob')).status,400);assert.equal((await queue('bob')).length,1);
 assert.equal((await request(`/availability/${id}/me`,'PUT',{slots},'bob')).status,200);
 assert.equal((await queue('bob')).length,0);assert.equal((await queue('carol')).length,1);assert.equal((await queue('bob','codecollective.us')).length,1);
 }finally{db.sqlite.close()}
});
