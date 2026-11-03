import assert from 'node:assert/strict';
import test from 'node:test';
import {readCurrentSchemaFileSync as readFileSync} from './helpers/currentSchema';
import {TimebankDatabase} from './helpers/timebankDatabase';
import {runOrganizationDirectoryOperation as run,type OrganizationOperationContext} from '../src/organizationDirectoryOperations';
import {claimOrganization} from '../src/organizationIam';
const operator:OrganizationOperationContext={actor:{id:'operator',name:'Operator',email:null,isOperator:true},scopes:['org:portal.read','org:portal.write']};
const owner={...operator,actor:{...operator.actor,id:'owner',isOperator:false}};
const args={organizationId:'org',userId:'recipient',reason:'Requested ownership assignment'};
async function setup(){
 const db=new TimebankDatabase();
 for(const migration of ['0002_org_event_directories.sql','0015_organization_iam.sql','0017_event_mcp_operations.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${migration}`,import.meta.url),'utf8'));
 db.sqlite.exec("ALTER TABLE organization_memberships ADD COLUMN pending_organizer INTEGER DEFAULT 0; INSERT INTO organizations(id,name,slug) VALUES('org','Example','example'),('other','Other','other');");
 await claimOrganization(db.asD1(),'org',owner.actor,'2026-10-20T12:00:00Z');
 db.sqlite.exec("INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES('org','recipient','administrator','active'),('org','colleague','administrator','active'),('other','foreign-user','member','active');");
 return db;
}
const preview=async(db:TimebankDatabase)=>await run(db.asD1(),operator,'transfer',args) as {previewId:string};
const activeOwner=(db:TimebankDatabase)=>db.sqlite.prepare("SELECT owner_user_id FROM organization_ownerships WHERE status='active'").get()!.owner_user_id;
test('superadmin transfer preserves history, directory and unrelated access with an audited one-use receipt',async()=>{
 const db=await setup();try{
  const p=await preview(db);assert.equal(activeOwner(db),'owner');
  await run(db.asD1(),operator,'transfer',{...args,confirm:true,previewId:p.previewId});
  assert.equal(activeOwner(db),'recipient');
  assert.equal(db.sqlite.prepare("SELECT status FROM organization_ownerships WHERE owner_user_id='owner'").get()!.status,'transferred');
  for(const [id,role] of [['owner','member'],['recipient','owner'],['colleague','administrator']])assert.equal(db.sqlite.prepare('SELECT role FROM organization_memberships WHERE user_id=?').get(id)!.role,role);
  assert.equal(db.sqlite.prepare("SELECT name FROM organizations WHERE id='org'").get()!.name,'Example');
  const audit=db.sqlite.prepare("SELECT actor_user_id,subject_user_id,metadata_json FROM audit_events WHERE action='organization.ownership_transferred'").get()!;
  assert.equal(audit.actor_user_id,'operator');assert.equal(audit.subject_user_id,'recipient');assert.match(String(audit.metadata_json),/Requested ownership assignment/);
  assert.match(JSON.stringify(await run(db.asD1(),operator,'status',{organizationId:'org',previewId:p.previewId})),/completed/);
  await assert.rejects(run(db.asD1(),operator,'transfer',{...args,confirm:true,previewId:p.previewId}),/already owns/);
 }finally{db.sqlite.close()}
});
test('owners, admins, read-only scopes, cross-tenant and forged authority cannot transfer; recipient must be active in this org',async()=>{
 const db=await setup();try{
  for(const actor of [owner,{...operator,actor:{...operator.actor,id:'recipient',isOperator:false}}])await assert.rejects(run(db.asD1(),actor,'transfer',args),/Superadmin/);
  await assert.rejects(run(db.asD1(),{...operator,scopes:['org:portal.read']},'transfer',args),/scope/);
  await assert.rejects(run(db.asD1(),{...operator,organizationId:'other'},'transfer',args),/own organization/);
  await assert.rejects(run(db.asD1(),operator,'transfer',{...args,isOperator:true}));
  for(const id of ['foreign-user','missing'])await assert.rejects(run(db.asD1(),operator,'transfer',{...args,userId:id}),/active member/);
  db.sqlite.exec("UPDATE organization_memberships SET status='inactive' WHERE user_id='recipient'");
  await assert.rejects(preview(db),/active member/);assert.equal(activeOwner(db),'owner');
 }finally{db.sqlite.close()}
});
test('receipt binds recipient, reason, actor, live superadmin authority and expiration',async()=>{
 const db=await setup();try{
  const p=await preview(db),apply={...args,confirm:true,previewId:p.previewId};
  await assert.rejects(run(db.asD1(),operator,'transfer',{...args,confirm:true}),/preview first/);
  for(const change of [{userId:'colleague'},{reason:'Another reason'}])await assert.rejects(run(db.asD1(),operator,'transfer',{...apply,...change}),/expired|changed/);
  await assert.rejects(run(db.asD1(),{...operator,actor:{...operator.actor,id:'other-operator'}},'transfer',apply),/expired|changed/);
  await assert.rejects(run(db.asD1(),{...operator,actor:{...operator.actor,isOperator:false}},'transfer',apply),/Superadmin/);
  db.sqlite.prepare('UPDATE event_mcp_operations SET expires_at=0 WHERE id=?').run(p.previewId);
  await assert.rejects(run(db.asD1(),operator,'transfer',apply),/expired|changed/);
 }finally{db.sqlite.close()}
});
test('concurrent membership change is denied atomically and late write failures roll back ownership and audit',async()=>{
 for(const failure of ['race','rollback']){
  const db=await setup();try{
   const p=await preview(db);
   if(failure==='race'){const batch=db.batch.bind(db);db.batch=async statements=>{db.sqlite.exec("UPDATE organization_memberships SET status='inactive' WHERE user_id='recipient'");return batch(statements)}}
   else db.sqlite.exec("CREATE TRIGGER fail_transfer BEFORE UPDATE OF role ON organization_memberships WHEN NEW.role='owner' BEGIN SELECT RAISE(ABORT,'injected late failure'); END;");
   await assert.rejects(run(db.asD1(),operator,'transfer',{...args,confirm:true,previewId:p.previewId}),failure==='race'?/Authority changed/:/injected late failure/);
   assert.equal(activeOwner(db),'owner');assert.equal(db.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE action='organization.ownership_transferred'").get()!.n,0);
  }finally{db.sqlite.close()}
 }
});
test('open challenges are reviewed and resolved within the transfer transaction',async()=>{
 const db=await setup();try{
  db.sqlite.exec("INSERT INTO organization_ownership_challenges(id,organization_id,ownership_id,challenger_user_id,explanation,status,created_at) SELECT 'claim','org',id,'recipient','Claim','open','2026-11-02' FROM organization_ownerships WHERE status='active'");
  const p=await preview(db);await run(db.asD1(),operator,'transfer',{...args,confirm:true,previewId:p.previewId});
  const challenge=db.sqlite.prepare('SELECT status,resolution,resolved_by_user_id FROM organization_ownership_challenges').get()!;
  assert.equal(challenge.status,'resolved');assert.equal(challenge.resolution,'challenger');assert.equal(challenge.resolved_by_user_id,'operator');
 }finally{db.sqlite.close()}
});

test('REST derives superadmin authority from live PIdP, ignores client claims and applies the same receipt policy',async t=>{
 const {app}=await import('../src/index');
 const db=await setup();const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;db.sqlite.close()});
 let superadmin=false;
 globalThis.fetch=async()=>Response.json({id:'operator',canonical_user_id:'operator',account_id:'operator',account_subject:'owner:operator',is_sysadmin:superadmin});
 const env={DB:db.asD1(),PIDP_BASE_URL:'https://identity.example'} as Env;
 const request=(phase:string,body:Record<string,unknown>)=>app.request(`https://portal.example/api/network/orgs/org/ownership/transfer/${phase}`,{method:'POST',headers:{Authorization:'Bearer local-synthetic','Content-Type':'application/json'},body:JSON.stringify(body)},env);
 const body={userId:args.userId,reason:args.reason};
 assert.equal((await request('preview',body)).status,403);
 superadmin=true;
 const response=await request('preview',body);assert.equal(response.status,200,await response.clone().text());
 const p=await response.json() as {previewId:string};
 superadmin=false;assert.equal((await request('apply',{...body,confirm:true,previewId:p.previewId})).status,403);assert.equal(activeOwner(db),'owner');
 superadmin=true;assert.equal((await request('apply',{...body,confirm:true,previewId:p.previewId})).status,200);assert.equal(activeOwner(db),'recipient');
});

test('D1 journal trigger change counts do not turn a committed transfer into a false conflict',async()=>{
 const db=await setup();try{
  const p=await preview(db),batch=db.batch.bind(db);
  db.batch=async statements=>{const results=await batch(statements);results[0].meta.changes=3;return results};
  await run(db.asD1(),operator,'transfer',{...args,confirm:true,previewId:p.previewId});
  assert.equal(activeOwner(db),'recipient');
  assert.match(JSON.stringify(await run(db.asD1(),operator,'status',{organizationId:'org',previewId:p.previewId})),/completed/);
 }finally{db.sqlite.close()}
});

test('uncertain committed transfer recovers only its exact authorized receipt without repeating ownership writes',async()=>{
 const db=await setup();try{
  const p=await preview(db),apply={...args,confirm:true,previewId:p.previewId};
  await run(db.asD1(),operator,'transfer',apply);
  db.sqlite.prepare("UPDATE event_mcp_operations SET status='uncertain',completed_steps_json='[]' WHERE id=?").run(p.previewId);
  await assert.rejects(run(db.asD1(),operator,'transfer',{...apply,reason:'Different reason'}),/already owns/);
  await assert.rejects(run(db.asD1(),{...operator,actor:{...operator.actor,id:'another'}},'transfer',apply),/already owns/);
  const recovered=await run(db.asD1(),operator,'transfer',apply);
  assert.equal((recovered as {recovered:boolean}).recovered,true);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM organization_ownerships').get()!.n,2);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE action='organization.ownership_transferred'").get()!.n,1);
  assert.match(JSON.stringify(await run(db.asD1(),operator,'status',{organizationId:'org',previewId:p.previewId})),/completed/);
  await assert.rejects(run(db.asD1(),operator,'transfer',apply),/already owns/);
 }finally{db.sqlite.close()}
});
