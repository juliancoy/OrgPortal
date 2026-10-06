import {Hono} from 'hono';
import {resolvePortalTenant} from './timebank';
import {authorizeOrganization} from './organizationIam';
import {EventIntegrationError} from './eventPlatforms';
import {prepareEventOperation,previewFingerprint,claimEventOperation,finishEventOperation} from './eventOperationStore';
export function onboardingSettingsRoutes(getUser:(env:Env,request:Request)=>Promise<{id:string;full_name?:string|null;email?:string|null}>){
 const app=new Hono<{Bindings:Env}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next()});
 app.post('/:operation',async c=>{
  try{
   const operation=c.req.param('operation');if(!['preview','apply'].includes(operation))return c.json({error:'Not found'},404);
   const user=await getUser(c.env,c.req.raw),tenant=await resolvePortalTenant(c.env.DB,c.req.raw),body=await c.req.json<Record<string,unknown>>();
   if(typeof body.enabled!=='boolean')throw new EventIntegrationError(400,'enabled must be a boolean');
   const organization=await c.env.DB.prepare('SELECT id FROM organizations WHERE slug=?').bind(tenant.home_org_slug).first<{id:string}>();
   if(!organization)throw new EventIntegrationError(409,'This tenant has no organization');
   await authorizeOrganization(c.env.DB,{id:user.id,name:user.full_name||user.id,email:user.email||null,isOperator:false},'manage',organization.id);
   const plan={tenantId:tenant.id,organizationId:organization.id,enabled:body.enabled,previousFeatureConfig:tenant.feature_config||'{}'};
   const owner={userId:user.id,organizationId:organization.id,eventId:`onboarding-settings:${tenant.id}`},fingerprint=await previewFingerprint(plan);
   if(operation==='preview')return c.json({...plan,...await prepareEventOperation(c.env.DB,owner,fingerprint)});
   if(body.confirm!==true||typeof body.previewId!=='string')throw new EventIntegrationError(409,'Confirm the reviewed preview');
   await claimEventOperation(c.env.DB,owner,body.previewId,fingerprint);
   try{
    const at=new Date().toISOString();
    await c.env.DB.batch([
     c.env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM portal_tenants WHERE id=? AND feature_config=?) THEN 1 ELSE json('Stale onboarding settings preview') END").bind(tenant.id,plan.previousFeatureConfig),
     c.env.DB.prepare("UPDATE portal_tenants SET feature_config=json_set(feature_config,'$.onboarding.enabled',json(?)),updated_at=? WHERE id=? AND feature_config=?").bind(JSON.stringify(body.enabled),at,tenant.id,plan.previousFeatureConfig),
     c.env.DB.prepare("INSERT INTO audit_events(id,actor_user_id,action,resource_type,resource_id,metadata_json,created_at) VALUES(?,?,'organization.onboarding.configured','organization',?,?,?)").bind(crypto.randomUUID(),user.id,organization.id,JSON.stringify({tenantId:tenant.id,enabled:body.enabled,previewId:body.previewId}),at),
    ]);
    await finishEventOperation(c.env.DB,body.previewId,true,['configure-onboarding']);
    return c.json({ok:true,previewId:body.previewId,enabled:body.enabled});
   }catch(error){await finishEventOperation(c.env.DB,body.previewId,false,[]);throw error}
  }catch(error){const e=error as {status?:number;message?:string};return c.json({error:e.message||'Onboarding configuration failed'},(e.status||500) as 400)}
 });
 return app;
}
