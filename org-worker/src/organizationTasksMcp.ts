import { z } from 'zod';
import { authorizeOrganization, listOrganizationMembers } from './organizationIam';
import { resolvePortalTenant } from './timebank';
import { onboardingEnabled } from './onboarding';
import { EventIntegrationError } from './eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, previewFingerprint, claimEventOperation, finishEventOperation } from './eventOperationStore';
export const organizationTaskSchema = z.object({ organizationId: z.string().min(1).max(200), task: z.literal('availability-calendar'), previewId: z.string().uuid().optional(), confirm: z.boolean().optional() }).strict();
export async function runOrganizationTaskOperation(env: Env, request: Request, identity: {userId:string;scopes:string[]}, input: unknown) {
 if(!identity.scopes.includes('org:portal.read')||!identity.scopes.includes('org:portal.write'))throw new EventIntegrationError(403,'Missing portal scope');
 const args=organizationTaskSchema.parse(input),actor={id:identity.userId,name:identity.userId,email:null,isOperator:false};
 await enforceEventRateLimit(env.DB,actor.id);
 await authorizeOrganization(env.DB,actor,'manage',args.organizationId);
 const tenant=await resolvePortalTenant(env.DB,request);
 const members=await listOrganizationMembers(env.DB,args.organizationId,actor);
 const recipients=members.map(m=>({userId:String(m.user_id),name:m.user_name||m.user_email||m.user_id})).sort((a,b)=>a.userId.localeCompare(b.userId));
 const entityId=`availability-calendar:${args.organizationId}`;
 const preview={organizationId:args.organizationId,tenantId:tenant.id,task:args.task,title:onboardingEnabled(tenant)?'Enter your availability for the next month':'Fill out your availability calendar',href:onboardingEnabled(tenant)?'/onboarding#availability':'/availability',recipientCount:recipients.length,recipients};
 const owner={userId:actor.id,organizationId:args.organizationId,eventId:'organization:availability-calendar'},fingerprint=await previewFingerprint(preview);
 if(!args.confirm)return {...preview,...await prepareEventOperation(env.DB,owner,fingerprint)};
 if(!args.previewId)throw new EventIntegrationError(409,'Request a preview first and supply its previewId');
 await claimEventOperation(env.DB,owner,args.previewId,fingerprint);
 try{
  // One SQL statement is atomic, includes every active member, and avoids duplicate tasks on retry.
  const result=await env.DB.prepare(`INSERT INTO user_tasks (id,tenant_id,user_id,created_by_user_id,kind,entity_id,title)
   SELECT lower(hex(randomblob(16))),?,user_id,?,'personal',?,? FROM organization_memberships WHERE organization_id = ? AND status = 'active'
   ON CONFLICT(tenant_id,user_id,kind,entity_id) DO NOTHING`).bind(tenant.id,actor.id,entityId,preview.title,args.organizationId).run();
  await finishEventOperation(env.DB,args.previewId,true,['assign-member-tasks']);
  return {...preview,previewId:args.previewId,assignedCount:result.meta.changes,alreadyAssignedCount:recipients.length-result.meta.changes};
 }catch(error){await finishEventOperation(env.DB,args.previewId,false,[]);throw error;}
}
