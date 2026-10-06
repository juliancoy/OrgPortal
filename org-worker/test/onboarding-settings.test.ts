import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {TimebankDatabase} from './helpers/timebankDatabase';
import {onboardingSettingsRoutes} from '../src/onboardingSettings';
import {resolvePortalTenant} from '../src/timebank';
import {app} from '../src/index';
import {identityProfile} from './helpers/identityProfile';
function fixture(){
 const db=new TimebankDatabase();
 for(const file of ['0002_org_event_directories.sql','0015_organization_iam.sql','0017_event_mcp_operations.sql','0029_portal_tenant_deployment_model.sql','0032_portal_tenant_org_slug.sql','0033_portal_tenant_custom_domains.sql','0051_onboarding.sql','0067_pending_organizers.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 db.sqlite.exec(`INSERT INTO organizations(id,name,slug,tags) VALUES('org','LifeTech','lifetech','[]');
 INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES('org','owner','owner','active');
 INSERT INTO organization_ownerships(id,organization_id,owner_user_id,status,started_at) VALUES('ownership','org','owner','active','2026-10-03');
 UPDATE portal_tenants SET hostname='lifetech.slug.portal.local',home_org_slug='lifetech',organization_id='org',slug='lifetech',custom_domain_hostname='medtech.social',custom_domain_status='attached',public_base_url='https://medtech.social',feature_config='{"slugPortal":{"enabled":true}}' WHERE id='baltimore-medtech';
 INSERT INTO onboarding_enrollments(tenant_id,user_id,start_date,end_date,completed_at) VALUES('baltimore-medtech','owner','2026-10-03','2026-11-03','2026-10-05T17:07:30.144Z');`);
 const env={DB:db.asD1(),PIDP_BASE_URL:'https://id.example'} as Env;
 const routes=onboardingSettingsRoutes(async(_env,request)=>({id:request.headers.get('authorization')||'stranger'}));
 const req=(operation:string,body:unknown,actor='owner')=>routes.request(`https://medtech.social/${operation}`,{method:'POST',headers:{authorization:actor,'content-type':'application/json'},body:JSON.stringify(body)},env);
 return {db,env,req};
}
test('attached domains retain their tenant and onboarding configuration requires an unchanged owner-reviewed preview',async()=>{
 const f=fixture();try{
  assert.equal((await resolvePortalTenant(f.env.DB,new Request('https://medtech.social/'))).id,'baltimore-medtech');
  assert.equal((await f.req('preview',{enabled:true},'stranger')).status,403);
  assert.equal((await f.req('apply',{enabled:true,confirm:true})).status,409);
  const plan=await (await f.req('preview',{enabled:true})).json() as {previewId:string};
  f.db.sqlite.exec("UPDATE portal_tenants SET feature_config=json_set(feature_config,'$.other',1) WHERE id='baltimore-medtech'");
  assert.equal((await f.req('apply',{enabled:true,confirm:true,previewId:plan.previewId})).status,409);
  const fresh=await (await f.req('preview',{enabled:true})).json() as {previewId:string};
  const applied=await f.req('apply',{enabled:true,confirm:true,previewId:fresh.previewId});assert.equal(applied.status,200,await applied.text());
  assert.deepEqual(JSON.parse(String(f.db.sqlite.prepare("SELECT feature_config FROM portal_tenants WHERE id='baltimore-medtech'").get()!.feature_config)),{slugPortal:{enabled:true},other:1,onboarding:{enabled:true}});
  assert.equal(f.db.sqlite.prepare('SELECT completed_at FROM onboarding_enrollments').get()!.completed_at,'2026-10-05T17:07:30.144Z');
  assert.equal((await f.req('apply',{enabled:true,confirm:true,previewId:fresh.previewId})).status,409);
 }finally{f.db.sqlite.close()}
});
test('saving a slug portal preserves attached domains and unrelated onboarding preferences',async t=>{
 const f=fixture();t.after(()=>f.db.sqlite.close());
 f.db.sqlite.exec("UPDATE portal_tenants SET hostname='medtech.social',feature_config=json_set(feature_config,'$.onboarding.enabled',json('true')) WHERE id='baltimore-medtech'");
 t.mock.method(globalThis,'fetch',async()=>Response.json(identityProfile({id:'owner',full_name:'Owner'})));
 const r=await app.request('https://medtech.social/api/network/orgs/org/portal',{method:'PUT',headers:{authorization:'Bearer session','content-type':'application/json'},body:JSON.stringify({name:'LifeTech',slug:'lifetech'})},f.env);
 assert.equal(r.status,200,await r.text());
 const tenant=f.db.sqlite.prepare("SELECT hostname,public_base_url,feature_config FROM portal_tenants WHERE id='baltimore-medtech'").get()!;
 assert.equal(tenant.hostname,'medtech.social');assert.equal(tenant.public_base_url,'https://medtech.social');
 assert.equal(JSON.parse(String(tenant.feature_config)).onboarding.enabled,true);
});
