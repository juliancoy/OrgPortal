import { z } from 'zod';
import { personnelSchemes, type PersonnelScheme } from '../../shared/organizationPersonnel';
import { authorizeOrganization } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { prepareEventOperation, claimEventOperation, finishEventOperation, previewFingerprint, enforceEventRateLimit } from './eventOperationStore';
export const personnelIntentSchema=z.object({scheme:z.enum(['meetup','nonprofit','corporation']),classes:z.array(z.string().min(1).max(60)).min(1).max(8).refine(v=>new Set(v).size===v.length),access:z.enum(['none','member'])}).strict().superRefine((intent,ctx)=>{
 for(const key of intent.classes)if(!Object.hasOwn(personnelSchemes[intent.scheme].classes,key)||['public','persona_non_grata'].includes(key))ctx.addIssue({code:'custom',message:'Choose an assignable class in the selected scheme'});
});
export type PersonnelIntent=z.infer<typeof personnelIntentSchema>;
export function readPersonnelIntent(raw:string|null|undefined):PersonnelIntent|null{return raw?personnelIntentSchema.parse(JSON.parse(raw)):null}
export function classLabel(scheme:PersonnelScheme,key:string){return (personnelSchemes[scheme].classes as Record<string,{label:string}>)[key]?.label||key}
export function requiresConfirmation(key:string){return ['board','executive','staff','employee','shareholder'].includes(key)}
export function intentDescription(intent:PersonnelIntent){return `${intent.classes.map(key=>classLabel(intent.scheme,key)).join(', ')}. ${intent.access==='member'?'Adds member access; existing roles remain.':'No portal membership access.'} Accepted classes are published on the personnel page. Board, executive, employment and shareholder classes require organizer confirmation with supporting evidence before publication.`}
export async function managePersonnel(db:D1Database,org:string,user:string){await authorizeOrganization(db,{id:user,name:user,email:null,isOperator:false},'manage',org)}
export async function readPersonnelRelationships(db:D1Database,org:string){return (await db.prepare('SELECT user_id,user_name,scheme,class_key,status,accepted_at,expires_at,evidence_url FROM organization_personnel_relationships WHERE organization_id=? AND expires_at>? ORDER BY user_name,class_key LIMIT 500').bind(org,Date.now()).all()).results}
export const relationshipActionSchema=z.object({organizationId:z.string().min(1).max(200),userId:z.string().min(1).max(200),scheme:z.enum(['meetup','nonprofit','corporation']),classKey:z.string().min(1).max(60),action:z.enum(['confirm','revoke']),evidenceUrl:z.string().url().max(2048).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password}).optional(),previewId:z.string().uuid().optional(),confirm:z.boolean().optional()}).strict();
export async function runRelationshipAction(db:D1Database,actor:string,input:unknown){
 const args=relationshipActionSchema.parse(input),org=args.organizationId;
 // Recipients may remove their own relationship; only managers may confirm it.
 if(args.action!=='revoke'||args.userId!==actor)await managePersonnel(db,org,actor);
 if(args.action==='confirm'&&!args.evidenceUrl)throw new EventIntegrationError(400,'A supporting HTTPS evidence URL is required');
 const before=await db.prepare('SELECT * FROM organization_personnel_relationships WHERE organization_id=? AND user_id=? AND scheme=? AND class_key=? AND expires_at>?').bind(org,args.userId,args.scheme,args.classKey,Date.now()).first();
 if(!before)throw new EventIntegrationError(404,'Relationship not found');
 await enforceEventRateLimit(db,actor);
 const owner={userId:actor,organizationId:org,eventId:'personnel:relationship'},fingerprint=await previewFingerprint({before,action:args.action,evidenceUrl:args.evidenceUrl||null});
 if(!args.confirm)return {...args,before:{scheme:args.scheme,classKey:args.classKey,status:before.status,expiresAt:before.expires_at},...await prepareEventOperation(db,owner,fingerprint)};
 if(!args.previewId)throw new EventIntegrationError(409,'Review the relationship update first');
 await claimEventOperation(db,owner,args.previewId,fingerprint);
 try{
  const permission="EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=? AND user_id=? AND status='active' AND role IN ('owner','administrator'))";
  const saved=args.action==='confirm'
   ? await db.prepare(`UPDATE organization_personnel_relationships SET status='active',evidence_url=?,confirmed_by=? WHERE organization_id=? AND user_id=? AND scheme=? AND class_key=? AND expires_at>? AND ${permission} RETURNING class_key`).bind(args.evidenceUrl!,actor,org,args.userId,args.scheme,args.classKey,Date.now(),org,actor).first()
   : await db.prepare(`DELETE FROM organization_personnel_relationships WHERE organization_id=? AND user_id=? AND scheme=? AND class_key=? AND (user_id=? OR ${permission}) RETURNING class_key`).bind(org,args.userId,args.scheme,args.classKey,actor,org,actor).first();
  if(!saved)throw new EventIntegrationError(409,'The relationship or management access changed. Review again');
  await finishEventOperation(db,args.previewId,true,['personnel-relationship']);return {saved:true};
 }catch(error){await finishEventOperation(db,args.previewId,false,[]);throw error}
}
