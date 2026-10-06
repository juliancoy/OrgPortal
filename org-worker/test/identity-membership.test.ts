import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TimebankDatabase} from './helpers/timebankDatabase';
import {identityMembershipRoutes} from '../src/identityMembership';
import {resolvePortalTenant} from '../src/timebank';
function fixture(){
 const db=new TimebankDatabase();
 db.sqlite.exec("ALTER TABLE portal_tenants ADD COLUMN feature_config TEXT NOT NULL DEFAULT '{}'");
 for(const file of ['0002_org_event_directories.sql','0015_organization_iam.sql','0017_event_mcp_operations.sql','0042_availability_polls.sql','0046_user_tasks.sql','0047_account_availability.sql','0051_onboarding.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 db.sqlite.exec(`INSERT INTO organizations(id,name,slug) VALUES('org','LifeTech','lifetech');
 INSERT INTO organization_memberships(organization_id,user_id,role,status,created_at,updated_at) VALUES ('org','person','owner','active','2026-10-05','2026-10-05'),('org','member','administrator','active','2026-10-05','2026-10-05');
 INSERT INTO organization_ownerships(id,organization_id,owner_user_id,status,started_at) VALUES('ownership','org','person','active','2026-10-05');`);
 const app=identityMembershipRoutes(async()=>({id:'person',canonical_user_id:'person',account_id:'person'}));
 const env={DB:db.asD1(),PIDP_BASE_URL:'https://id.example'} as Env;
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://id.example/auth/account-links');assert.equal(new Headers(options?.headers).get('authorization'),'Bearer session');return Response.json({canonical_user_id:'person',accounts:[{website_user_id:'member',subject:'website:site:member',linked_at:'2026-10-05'}]})};
 const req=(operation:string,body:unknown)=>app.fetch(new Request(`https://medtech.social/org/${operation}`,{method:'POST',headers:{authorization:'Bearer session','content-type':'application/json'},body:JSON.stringify(body)}),env);
 return {db,req,close(){globalThis.fetch=original;db.sqlite.close()}};
}
test('reviewed consolidation preserves ownership, combines personal tasks, retires the duplicate membership, and records an audit',async()=>{
 const f=fixture();try{
  const tenant=await resolvePortalTenant(f.db.asD1(),new Request('https://medtech.social/'));
  const insert=f.db.sqlite.prepare("INSERT INTO user_tasks(id,tenant_id,user_id,created_by_user_id,kind,entity_id,title,status) VALUES(?,?,?,?,'personal',?,'Task',?)");
  insert.run('canonical',tenant.id,'person','person','shared','pending');insert.run('duplicate',tenant.id,'member','member','shared','completed');insert.run('unique',tenant.id,'member','member',null,'pending');
  const preview=await f.req('preview',{sourceAccountId:'member'});assert.equal(preview.status,200);
  const plan=await preview.json() as {previewId:string;role:string};assert.equal(plan.role,'owner');
  assert.equal(f.db.sqlite.prepare("SELECT status FROM organization_memberships WHERE user_id='member'").get()!.status,'active');
  assert.equal((await f.req('apply',{sourceAccountId:'member',previewId:plan.previewId,confirm:false})).status,409);
  const applied=await f.req('apply',{sourceAccountId:'member',previewId:plan.previewId,confirm:true});assert.equal(applied.status,200,await applied.text());
  assert.equal(f.db.sqlite.prepare("SELECT role FROM organization_memberships WHERE user_id='person'").get()!.role,'owner');
  assert.equal(f.db.sqlite.prepare("SELECT status FROM organization_memberships WHERE user_id='member'").get()!.status,'inactive');
  assert.equal(f.db.sqlite.prepare('SELECT owner_user_id FROM organization_ownerships').get()!.owner_user_id,'person');
  assert.equal(f.db.sqlite.prepare("SELECT status FROM user_tasks WHERE id='canonical'").get()!.status,'completed');
  assert.equal(f.db.sqlite.prepare("SELECT user_id FROM user_tasks WHERE id='unique'").get()!.user_id,'person');
  assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE action='organization.identity_consolidated'").get()!.n,1);
  assert.equal((await f.req('apply',{sourceAccountId:'member',previewId:plan.previewId,confirm:true})).status,409);
 }finally{f.close()}
});
test('unlinked accounts, revoked membership conflicts, and changes after preview cannot grant access',async()=>{
 const f=fixture();try{
  assert.equal((await f.req('preview',{sourceAccountId:'other'})).status,403);
  const plan=await (await f.req('preview',{sourceAccountId:'member'})).json() as {previewId:string};
  f.db.sqlite.exec("UPDATE organization_memberships SET role='member',updated_at='changed' WHERE user_id='member'");
  assert.equal((await f.req('apply',{sourceAccountId:'member',previewId:plan.previewId,confirm:true})).status,409);
  assert.equal(f.db.sqlite.prepare("SELECT status FROM organization_memberships WHERE user_id='member'").get()!.status,'active');
  f.db.sqlite.exec("UPDATE organization_memberships SET status='inactive' WHERE user_id='person'; UPDATE organization_memberships SET role='administrator' WHERE user_id='member'");
  assert.equal((await f.req('preview',{sourceAccountId:'member'})).status,409);
 }finally{f.close()}
});
