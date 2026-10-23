import {readMemberTitles} from '../../shared/organizationMemberTitles';
import { z } from 'zod';
import { Hono } from 'hono';
import { EventIntegrationError } from './eventPlatforms';
import { authorizeOrganization } from './organizationIam';
import { lookupPortalPeople } from './portalPeople';
import { enforceEventRateLimit, prepareEventOperation, claimEventOperation, finishEventOperation, previewFingerprint } from './eventOperationStore';

export const memberTitlesSchema=z.object({
 organizationId:z.string().min(1).max(200),user_id:z.string().min(1).max(200),
 titles:z.array(z.string().trim().min(1).max(100).refine(value=>!/[\r\n\0]/.test(value),'Use a single-line title')).max(8)
  .refine(values=>new Set(values.map(value=>value.toLowerCase())).size===values.length,'Choose each title once'),
 previewId:z.string().uuid().optional(),confirm:z.boolean().optional(),
}).strict();
export const organizationPeopleSchema=z.object({organizationId:z.string().min(1).max(200),q:z.string().trim().min(2).max(254),limit:z.number().int().min(1).max(100).default(40),offset:z.number().int().min(0).max(100000).default(0)}).strict();
type Identity={userId:string;scopes:string[]};
export async function organizationTitlePeople(db:D1Database,identity:Identity,input:unknown){
 const args=organizationPeopleSchema.parse(input);
 if(!identity.scopes.includes('org:portal.read'))throw new EventIntegrationError(403,'Missing portal read scope');
 await authorizeOrganization(db,{id:identity.userId,name:identity.userId,email:null,isOperator:false},'manage',args.organizationId);
 return lookupPortalPeople(db,args.q,args.limit,args.offset);
}
export async function runMemberTitlesOperation(db:D1Database,identity:Identity,input:unknown){
 const args=memberTitlesSchema.parse(input);
 if(!identity.scopes.includes('org:portal.read')||!identity.scopes.includes('org:portal.write'))throw new EventIntegrationError(403,'Missing portal scope');
 const actor={id:identity.userId,name:identity.userId,email:null,isOperator:false};
 await authorizeOrganization(db,actor,'manage',args.organizationId);await enforceEventRateLimit(db,actor.id);
 const before=await db.prepare("SELECT user_id,role,status,titles_json,updated_at FROM organization_memberships WHERE organization_id=? AND user_id=? AND status='active'")
  .bind(args.organizationId,args.user_id).first<{user_id:string;role:string;status:string;titles_json:string;updated_at:string}>();
 if(!before)throw new EventIntegrationError(404,'Add this account as an active member before assigning titles.');
 const preview={organizationId:args.organizationId,user_id:args.user_id,before:{titles:readMemberTitles(before.titles_json),role:before.role,status:before.status,updated_at:before.updated_at},titles:args.titles,permissionsChanged:false,publicBoard:true};
 const owner={userId:actor.id,organizationId:args.organizationId,eventId:`member-titles:${args.user_id}`},fingerprint=await previewFingerprint(preview);
 if(!args.confirm)return {...preview,...await prepareEventOperation(db,owner,fingerprint)};
 if(!args.previewId)throw new EventIntegrationError(409,'Review the title assignment first.');
 await claimEventOperation(db,owner,args.previewId,fingerprint);
 try{
  const saved=await db.prepare(`UPDATE organization_memberships SET titles_json=?,updated_at=? WHERE organization_id=? AND user_id=? AND status='active'
   AND titles_json IS ? AND role IS ? AND updated_at IS ?
   AND EXISTS(SELECT 1 FROM organization_memberships manager WHERE manager.organization_id=? AND manager.user_id=? AND manager.status='active' AND manager.role IN ('owner','administrator'))
   RETURNING user_id,role,status,titles_json`)
   .bind(JSON.stringify(args.titles),new Date().toISOString(),args.organizationId,args.user_id,before.titles_json,before.role,before.updated_at,args.organizationId,actor.id)
   .first<{user_id:string;role:string;status:string;titles_json:string}>();
  if(!saved)throw new EventIntegrationError(409,'Membership, titles, or management access changed. Review a new preview.');
  await finishEventOperation(db,args.previewId,true,['member-titles']);
  return {user_id:saved.user_id,role:saved.role,status:saved.status,titles:readMemberTitles(saved.titles_json),previewId:args.previewId};
 }catch(error){await finishEventOperation(db,args.previewId,false,[]);throw error}
}
export function organizationMemberTitleRoutes(auth:(env:Env,request:Request)=>Promise<{id:string}>,onError:(error:unknown,env:Env,request:Request)=>Response|Promise<Response>){
 const app=new Hono<{Bindings:Env}>();
 app.get('/public/:slug/board',async c=>{
  c.header('Cache-Control','no-store');
  const org=await c.env.DB.prepare('SELECT id,name,slug FROM organizations WHERE slug=?').bind(c.req.param('slug')).first<{id:string;name:string;slug:string}>();
  if(!org)return c.json({error:'Organization not found'},404);
  const rows=await c.env.DB.prepare(`SELECT m.user_id,m.user_name,m.role,m.titles_json,c.user_name AS profile_name,
   (SELECT decision FROM organization_personnel_motions WHERE organization_id=? AND target_user_id=m.user_id AND status='passed' ORDER BY updated_at DESC,id DESC LIMIT 1) AS conduct_decision,
   CASE WHEN c.enabled=1 THEN c.photo_url END AS photo_url,CASE WHEN c.enabled=1 THEN c.slug END AS profile_slug
   FROM organization_memberships m LEFT JOIN user_contact_pages c ON c.user_id=m.user_id
   WHERE m.organization_id=? AND m.status='active' AND json_array_length(m.titles_json)>0
   ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'administrator' THEN 1 ELSE 2 END,lower(COALESCE(NULLIF(m.user_name,''),c.user_name,'')),m.user_id LIMIT 500`)
   .bind(org.id,org.id).all<{conduct_decision:string|null;user_id:string;user_name:string|null;role:string;titles_json:string;profile_name:string|null;photo_url:string|null;profile_slug:string|null}>();
  const people=await Promise.all(rows.results.map(async row=>{
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${org.id}:${row.user_id}`));
   return {id:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join(''),
    name:(!row.user_name||row.user_name===row.user_id?row.profile_name:row.user_name)||'Organization member',
    titles:readMemberTitles(row.titles_json),photo_url:row.photo_url,profile_slug:row.profile_slug,
    personnel_class:row.conduct_decision==='exclude'?'persona_non_grata':row.role==='owner'||row.role==='administrator'?'organizer':'member'};
  }));
  return c.json({organization:org,people});
 });
 app.post('/:organizationId/members/:userId/titles/:operation',async c=>{
  c.header('Cache-Control','no-store');
  if(!['preview','apply'].includes(c.req.param('operation')))return c.json({error:'Not found'},404);
  try{
   const user=await auth(c.env,c.req.raw),payload=await c.req.json();
   return c.json(await runMemberTitlesOperation(c.env.DB,{userId:user.id,scopes:['org:portal.read','org:portal.write']},{...payload,organizationId:c.req.param('organizationId'),user_id:c.req.param('userId'),confirm:c.req.param('operation')==='apply'}));
  }catch(error){return onError(error,c.env,c.req.raw)}
 });
 return app;
}
