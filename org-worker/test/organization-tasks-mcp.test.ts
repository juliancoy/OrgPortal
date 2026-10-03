import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { runOrganizationTaskOperation } from '../src/organizationTasksMcp';
import { claimOrganization } from '../src/organizationIam';
const identity={userId:'owner',scopes:['org:portal.read','org:portal.write']};
test('bulk availability tasks require management, scopes and unchanged one-use preview; active members only, no duplicates',async()=>{
 const db=new TimebankDatabase();
 for(const file of ['0002_org_event_directories.sql','0015_organization_iam.sql','0017_event_mcp_operations.sql','0046_user_tasks.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 const env={DB:db.asD1()} as Env,request=new Request('https://medtech.social/api/org/mcp');
 db.sqlite.exec("INSERT INTO organizations(id,name,slug,tags,city) VALUES ('org','LifeTech','lifetech','[]','Baltimore')");
 await claimOrganization(env.DB,'org',{id:'owner',name:'Owner',email:null,isOperator:false},new Date().toISOString());
 const insert=db.sqlite.prepare("INSERT INTO organization_memberships(organization_id,user_id,role,status,created_at,updated_at) VALUES ('org',?,'member',?,datetime('now'),datetime('now'))");insert.run('member','active');insert.run('inactive','inactive');
 const args={organizationId:'org',task:'availability-calendar'};
 try{
  await assert.rejects(runOrganizationTaskOperation(env,request,{...identity,scopes:['org:portal.read']},args),/scope/);
  await assert.rejects(runOrganizationTaskOperation(env,request,{...identity,userId:'member'},args),/management/);
  await assert.rejects(runOrganizationTaskOperation(env,request,identity,{...args,confirm:true}),/preview first/);
  const preview=await runOrganizationTaskOperation(env,request,identity,args);assert.equal(preview.recipientCount,2);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM user_tasks').get()!.n,0);
  insert.run('new-member','active');
  await assert.rejects(runOrganizationTaskOperation(env,request,identity,{...args,confirm:true,previewId:preview.previewId}),/changed/);
  const fresh=await runOrganizationTaskOperation(env,request,identity,args);
  const applied=await runOrganizationTaskOperation(env,request,identity,{...args,confirm:true,previewId:fresh.previewId});assert.equal(applied.assignedCount,3);
  await assert.rejects(runOrganizationTaskOperation(env,request,identity,{...args,confirm:true,previewId:fresh.previewId}),/already used/);
  const again=await runOrganizationTaskOperation(env,request,identity,args);
  const retry=await runOrganizationTaskOperation(env,request,identity,{...args,confirm:true,previewId:again.previewId});assert.equal(retry.assignedCount,0);assert.equal(retry.alreadyAssignedCount,3);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM user_tasks WHERE user_id='inactive'").get()!.n,0);
 }finally{db.sqlite.close()}
});
