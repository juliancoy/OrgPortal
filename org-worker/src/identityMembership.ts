import {Hono} from 'hono';
import {authorizeOrganization} from './organizationIam';
import {resolvePortalTenant} from './timebank';
import {ensureOnboarding,identityProgressStatements} from './onboarding';
import {EventIntegrationError} from './eventPlatforms';
import {prepareEventOperation,previewFingerprint,claimEventOperation,finishEventOperation} from './eventOperationStore';
type Person={id:string;canonical_user_id?:string;account_id?:string;email?:string|null;full_name?:string|null};
type Membership={role:'owner'|'administrator'|'member';status:string;user_name:string|null;user_email:string|null;updated_at:string};
export function identityMembershipRoutes(getUser:(env:Env,request:Request)=>Promise<Person>){
 const app=new Hono<{Bindings:Env}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next()});
 app.post('/:organizationId/:operation',async c=>{
  try{
   const operation=c.req.param('operation');
   if(!['preview','apply'].includes(operation))return c.json({error:'Not found'},404);
   const user=await getUser(c.env,c.req.raw),body=await c.req.json<Record<string,unknown>>();
   if(user.canonical_user_id!==user.id)throw new EventIntegrationError(401,'A verified PIdP person is required');
   if(typeof body.sourceAccountId!=='string'||body.sourceAccountId===user.id)throw new EventIntegrationError(400,'Select a linked account');
   const identityResponse=await fetch(`${(c.env.PIDP_BASE_URL||'https://id.codecollective.us').replace(/\/+$/,'')}/auth/account-links`,{headers:{Authorization:c.req.header('authorization')||''},redirect:'manual'});
   if(!identityResponse.ok)throw new EventIntegrationError(503,'PIdP account-link verification is unavailable');
   const identity=await identityResponse.json() as {canonical_user_id:string;accounts:Array<{subject:string;website_user_id:string;linked_at:string}>};
   const linked=identity.accounts?.find(account=>account.website_user_id===body.sourceAccountId);
   if(identity.canonical_user_id!==user.id||!linked)throw new EventIntegrationError(403,'PIdP has not linked this account to your identity');
   const organizationId=c.req.param('organizationId'),sourceId=body.sourceAccountId;
   const actor={id:user.id,name:user.full_name||user.id,email:user.email||null,isOperator:false};
   try{await authorizeOrganization(c.env.DB,actor,'manage',organizationId)}catch(error){
    if((error as {status?:number}).status!==403)throw error;
    await authorizeOrganization(c.env.DB,{...actor,id:sourceId},'manage',organizationId);
   }
   const member=async(id:string)=>c.env.DB.prepare('SELECT role,status,user_name,user_email,updated_at FROM organization_memberships WHERE organization_id=? AND user_id=?').bind(organizationId,id).first<Membership>();
   const [source,canonical]=await Promise.all([member(sourceId),member(user.id)]);
   if(!source||source.status!=='active')throw new EventIntegrationError(409,'The linked account has no active membership to consolidate');
   if(canonical&&canonical.status!=='active')throw new EventIntegrationError(409,'The canonical membership is inactive; an organization administrator must review the conflict');
   const roles=['member','administrator','owner'];
   const role=canonical&&roles.indexOf(canonical.role)>roles.indexOf(source.role)?canonical.role:source.role;
   const ownership=await c.env.DB.prepare("SELECT id,owner_user_id FROM organization_ownerships WHERE organization_id=? AND status='active'").bind(organizationId).first<{id:string;owner_user_id:string}>();
   if(role==='owner'&&(!ownership||![sourceId,user.id].includes(ownership.owner_user_id)))throw new EventIntegrationError(409,'Membership and ownership disagree; an organization administrator must review the conflict');
   const tenant=await resolvePortalTenant(c.env.DB,c.req.raw);
   const tasks=await c.env.DB.prepare('SELECT id,entity_id,status FROM user_tasks WHERE tenant_id=? AND user_id=? ORDER BY id').bind(tenant.id,sourceId).all();
   const plan={organizationId,tenantId:tenant.id,canonicalUserId:user.id,sourceAccountId:sourceId,link:linked,sourceMembership:source,canonicalMembership:canonical,role,ownership,sourceTasks:tasks.results};
   const owner={userId:user.id,organizationId,eventId:`identity-membership:${sourceId}`},fingerprint=await previewFingerprint(plan);
   if(operation==='preview')return c.json({...plan,...await prepareEventOperation(c.env.DB,owner,fingerprint)});
   if(body.confirm!==true||typeof body.previewId!=='string')throw new EventIntegrationError(409,'Confirm the reviewed preview');
   await claimEventOperation(c.env.DB,owner,body.previewId,fingerprint);
   const at=new Date().toISOString();
   try{
    await c.env.DB.batch([
     // Recheck authority-bearing rows under the same transaction as the writes.
     // Malformed JSON deliberately aborts and rolls back a stale preview.
     c.env.DB.prepare(`SELECT CASE WHEN
      EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=? AND user_id=? AND role=? AND status='active' AND updated_at=?)
      AND ${canonical ? "EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=? AND user_id=? AND role=? AND status=? AND updated_at=?)" : "NOT EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=? AND user_id=?)"}
      AND ${ownership ? "EXISTS(SELECT 1 FROM organization_ownerships WHERE id=? AND owner_user_id=? AND status='active')" : "NOT EXISTS(SELECT 1 FROM organization_ownerships WHERE organization_id=? AND status='active')"}
      THEN 1 ELSE json('Stale identity membership preview') END`).bind(
       organizationId,sourceId,source.role,source.updated_at,
       ...(canonical?[organizationId,user.id,canonical.role,canonical.status,canonical.updated_at]:[organizationId,user.id]),
       ...(ownership?[ownership.id,ownership.owner_user_id]:[organizationId])),
     c.env.DB.prepare(`INSERT INTO organization_memberships(organization_id,user_id,user_name,user_email,role,status,created_at,updated_at)
      VALUES(?,?,?,?,?,'active',?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role,updated_at=excluded.updated_at`).bind(organizationId,user.id,user.full_name||source.user_name,user.email||source.user_email,role,at,at),
     c.env.DB.prepare("UPDATE organization_ownerships SET owner_user_id=? WHERE organization_id=? AND owner_user_id=? AND status='active'").bind(user.id,organizationId,sourceId),
     c.env.DB.prepare("UPDATE organization_memberships SET status='inactive',updated_at=? WHERE organization_id=? AND user_id=? AND status='active'").bind(at,organizationId,sourceId),
     c.env.DB.prepare(`UPDATE user_tasks AS canonical SET status='completed',completed_at=COALESCE(completed_at,?)
      WHERE tenant_id=? AND user_id=? AND EXISTS(SELECT 1 FROM user_tasks source WHERE source.tenant_id=canonical.tenant_id AND source.user_id=? AND source.kind=canonical.kind AND source.entity_id=canonical.entity_id AND source.status='completed')`).bind(at,tenant.id,user.id,sourceId),
     c.env.DB.prepare(`UPDATE user_tasks AS source SET user_id=? WHERE tenant_id=? AND user_id=? AND NOT EXISTS(
      SELECT 1 FROM user_tasks canonical WHERE canonical.tenant_id=source.tenant_id AND canonical.user_id=? AND canonical.kind=source.kind AND canonical.entity_id=source.entity_id)`).bind(user.id,tenant.id,sourceId,user.id),
     c.env.DB.prepare("UPDATE user_tasks SET status='completed',completed_at=COALESCE(completed_at,?) WHERE tenant_id=? AND user_id=?").bind(at,tenant.id,sourceId),
     ...identityProgressStatements(c.env.DB,tenant,user.id,sourceId),
     c.env.DB.prepare(`INSERT INTO audit_events(id,actor_user_id,action,resource_type,resource_id,subject_user_id,metadata_json,created_at)
      VALUES(?,?,'organization.identity_consolidated','organization',?,?,?,?)`).bind(crypto.randomUUID(),user.id,organizationId,sourceId,JSON.stringify({previewId:body.previewId,canonical_user_id:user.id,account_subject:linked.subject,sourceMembership:source,canonicalMembership:canonical}),at),
    ]);
    await ensureOnboarding(c.env.DB,tenant,user.id);
    await finishEventOperation(c.env.DB,body.previewId,true,['consolidate-membership','preserve-personal-progress']);
    return c.json({ok:true,previewId:body.previewId,canonicalUserId:user.id,role});
   }catch(error){await finishEventOperation(c.env.DB,body.previewId,false,[]);throw error}
  }catch(error){const e=error as {status?:number;message?:string};return c.json({error:e.message||'Identity consolidation failed'},(e.status||500) as 400)}
 });
 return app;
}
