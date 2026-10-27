import {archiveInvitationMail} from './supportCorrespondence';
import { personnelIntentSchema, readPersonnelIntent, intentDescription, requiresConfirmation, managePersonnel, readPersonnelRelationships, relationshipActionSchema, runRelationshipAction } from './personnelRelationships';
import { z } from 'zod';
import { EventIntegrationError } from './eventPlatforms';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { organizationRole, OrganizationIamError } from './organizationIam';
import { normalizeEmail, emailFail, emailPortalBase, emailDailyLimit } from './emailShared';
import { prepareEventOperation, claimEventOperation, finishEventOperation, previewFingerprint, enforceEventRateLimit } from './eventOperationStore';
import { monthsAfter } from './organizationPersonnel';
import { googleAccessToken, sendGmail, type Sender } from './emailGoogle';
import { emailMime, escapeHtml } from './emailTemplate';
type Actor={id:string;email?:string|null;full_name?:string|null;identity_data?:Record<string,unknown>|null};
const receiptSchema=z.object({previewId:z.string().uuid().optional(),confirm:z.boolean().optional()}).strict();
export const issueInvitationSchema=receiptSchema.extend({email:z.string().max(254),purpose:z.enum(['member','volunteer']).optional(),intent:personnelIntentSchema.optional()});
type Invitation={id:string;organization_id:string;email:string;purpose:'member'|'volunteer';invited_by:string;created_at:number;expires_at:number;status:string;attempts:number;attempted_at?:number|null;intent_json:string|null;delivery_blocker?:string|null};
async function issuerAllowed(db:D1Database,org:string,user:string,purpose:string){const role=await organizationRole(db,org,user);return !!role&&(purpose==='volunteer'||role==='owner'||role==='administrator')}
export function verifiedInvitationRecipient(actor:Actor,email:string){return normalizeEmail(actor.email)===email&&actor.identity_data?.email_verified===true}
export function organizationInvitationRoutes(auth:(env:Env,req:Request)=>Promise<Actor>){
 const app=new Hono<{Bindings:Env}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next()});
 app.onError((e,c)=>e instanceof HTTPException?e.getResponse():e instanceof z.ZodError?c.json({error:'Invalid invitation request'},400):e instanceof OrganizationIamError?c.json({error:e.message},e.status as ContentfulStatusCode):e instanceof EventIntegrationError?c.json({error:e.message},e.status as ContentfulStatusCode):c.json({error:'Could not process invitation'},500));
 app.get('/orgs/:org/relationships/me',async c=>{
  const actor=await auth(c.env,c.req.raw);
  const rows=await c.env.DB.prepare('SELECT scheme,class_key,role_name,status,accepted_at,expires_at FROM organization_personnel_relationships WHERE organization_id=? AND user_id=? AND expires_at>?').bind(c.req.param('org'),actor.id,Date.now()).all();
  return c.json({userId:actor.id,relationships:rows.results});
 });
 app.get('/orgs/:org/invitations',async c=>{
  const actor=await auth(c.env,c.req.raw),org=c.req.param('org');await managePersonnel(c.env.DB,org,actor.id);
  const rows=await c.env.DB.prepare('SELECT id,email,purpose,intent_json,status,email_status,delivery_blocker,attempts,created_at,expires_at,email_archive_ticket_id AS correspondence_ticket_id FROM organization_invitations WHERE organization_id=? ORDER BY created_at DESC LIMIT 100').bind(org).all<Invitation>();
  return c.json({invitations:rows.results.map(row=>({...row,intent:readPersonnelIntent(row.intent_json),intent_json:undefined,status:row.status==='pending'&&row.expires_at<=Date.now()?'expired':row.status})),relationships:await readPersonnelRelationships(c.env.DB,org)});
 });
 app.post('/orgs/:org/relationships/:operation',async c=>{
  if(!['preview','apply'].includes(c.req.param('operation')))emailFail(404,'Operation not found');
  const actor=await auth(c.env,c.req.raw),args=relationshipActionSchema.omit({organizationId:true}).parse(await c.req.json());
  return c.json(await runRelationshipAction(c.env.DB,actor.id,{...args,organizationId:c.req.param('org'),confirm:c.req.param('operation')==='apply'}));
 });
 app.post('/orgs/:org/invitations/:id/cancel/:operation',async c=>{
  const actor=await auth(c.env,c.req.raw),db=c.env.DB,org=c.req.param('org');await managePersonnel(db,org,actor.id);await enforceEventRateLimit(db,actor.id);
  const phase=c.req.param('operation');if(!['preview','apply'].includes(phase))emailFail(404,'Operation not found');
  const row=await db.prepare("SELECT id,email,intent_json FROM organization_invitations WHERE id=? AND organization_id=? AND status='pending'").bind(c.req.param('id'),org).first();
  if(!row)emailFail(404,'Pending invitation not found');
  const owner={userId:actor.id,organizationId:org,eventId:'invitation:cancel'},fingerprint=await previewFingerprint(row);
  if(phase==='preview')return c.json({...row,...await prepareEventOperation(db,owner,fingerprint)});
  const args=receiptSchema.parse(await c.req.json());if(!args.confirm||!args.previewId)emailFail(409,'Review cancellation first');
  await claimEventOperation(db,owner,args.previewId!,fingerprint);
  await db.prepare("UPDATE organization_invitations SET status='cancelled' WHERE id=? AND organization_id=? AND status='pending'").bind(c.req.param('id'),org).run();
  await finishEventOperation(db,args.previewId!,true,['invitation-cancelled']);return c.json({cancelled:true});
 });
 app.post('/orgs/:org/invitations/:operation',async c=>{
  const actor=await auth(c.env,c.req.raw),db=c.env.DB,org=c.req.param('org'),operation=c.req.param('operation');
  if(!['preview','apply'].includes(operation))emailFail(404,'Operation not found');
  const args=issueInvitationSchema.parse(await c.req.json()),email=normalizeEmail(args.email),purpose=args.intent?(args.intent.access==='member'?'member':'volunteer'):(args.purpose||'member');
  if(!email||!['member','volunteer'].includes(purpose))emailFail(400,'Choose a valid email and invitation type');
  if(args.intent){
   await managePersonnel(db,org,actor.id);
   if(args.purpose&&args.purpose!==purpose)emailFail(400,'Invitation purpose must match the reviewed access');
   const selected=await db.prepare('SELECT scheme FROM organization_personnel_schemes WHERE organization_id=?').bind(org).first<{scheme:string}>();
   if((selected?.scheme||'meetup')!==args.intent.scheme)emailFail(409,'Choose classes from the organization’s current scheme');
  }
  if(!await issuerAllowed(db,org,actor.id,purpose))emailFail(403,'Organization permission required');
  const organization=await db.prepare('SELECT name FROM organizations WHERE id=?').bind(org).first<{name:string}>();
  if(!organization)emailFail(404,'Organization not found');
  await enforceEventRateLimit(db,actor.id);
  const owner={userId:actor.id,organizationId:org,eventId:'organization:invite'};
  const fingerprint=await previewFingerprint({email,purpose,intent:args.intent||null});
  if(operation==='preview')return c.json({email,purpose,organization:organization.name,intent:args.intent||null,effect:args.intent?intentDescription(args.intent):purpose==='member'?'Join as a member':'Volunteer recognition only',...await prepareEventOperation(db,owner,fingerprint)});
  if(args.confirm!==true||!args.previewId)emailFail(409,'Review and confirm the invitation first');
  await claimEventOperation(db,owner,args.previewId,fingerprint);
  try{
   const now=Date.now();
   await db.prepare("DELETE FROM organization_invitations WHERE organization_id=? AND email=? AND purpose=? AND expires_at<=?").bind(org,email,purpose,now).run();
   const intent=args.intent?JSON.stringify(args.intent):null;
   const existing=await db.prepare("SELECT intent_json FROM organization_invitations WHERE organization_id=? AND email=? AND purpose=? AND status='pending'").bind(org,email,purpose).first<{intent_json:string|null}>();
   if(existing&&(existing.intent_json||null)!==intent)emailFail(409,'A different invitation is already pending. Cancel it before changing classes or access');
   await db.prepare('INSERT OR IGNORE INTO organization_invitations(id,organization_id,email,purpose,invited_by,created_at,expires_at,intent_json) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),org,email,purpose,actor.id,now,now+7*86400000,intent).run();
   const pending=await db.prepare("SELECT id,intent_json FROM organization_invitations WHERE organization_id=? AND email=? AND purpose=? AND status='pending'").bind(org,email,purpose).first<{id:string;intent_json:string|null}>();
   if(!pending||(pending.intent_json||null)!==intent)emailFail(409,'The pending invitation changed. Review again');
   await finishEventOperation(db,args.previewId,true,['invite']);
   return c.json({saved:true,invitationId:pending?.id,message:'Invitation queued. It expires in seven days.'});
  }catch(e){await finishEventOperation(db,args.previewId,false,[]);throw e}
 });
 async function recipient(db:D1Database,id:string,actor:Actor){
  const invitation=await db.prepare('SELECT id,organization_id,email,purpose,invited_by,created_at,expires_at,status,intent_json FROM organization_invitations WHERE id=?').bind(id).first<Invitation>();
  if(!invitation||!verifiedInvitationRecipient(actor,invitation.email))emailFail(403,'Sign in with the verified email address that received this invitation');
  if(invitation.status!=='pending'||invitation.expires_at<=Date.now())emailFail(409,'Invitation expired or already accepted');
  if(invitation.intent_json)await managePersonnel(db,invitation.organization_id,invitation.invited_by);
  if(!await issuerAllowed(db,invitation.organization_id,invitation.invited_by,invitation.purpose))emailFail(409,'The inviter no longer has permission');
  const existing=await db.prepare('SELECT status FROM organization_memberships WHERE organization_id=? AND user_id=?').bind(invitation.organization_id,actor.id).first<{status:string}>();
  if(invitation.purpose==='member'&&existing?.status==='inactive')emailFail(409,'Ask an organizer to restore your existing inactive membership');
  return invitation;
 }
 // Possession of the invitation URL permits reading its invitation card only.
 // Recipient identity and acceptance remain protected by recipient() below.
 app.get('/invitations/:id/public',async c=>{
  c.header('X-Robots-Tag','noindex, nofollow, noarchive');
  const invitation=await c.env.DB.prepare('SELECT organization_id,purpose,status,expires_at,intent_json,invited_by FROM organization_invitations WHERE id=?').bind(c.req.param('id')).first<Invitation>();
  if(!invitation)emailFail(404,'Invitation not found');
  if(invitation.status!=='pending'||invitation.expires_at<=Date.now()||!await issuerAllowed(c.env.DB,invitation.organization_id,invitation.invited_by,invitation.purpose))return c.json({error:'This invitation is no longer available. Ask the sender for a new invitation.'},410);
  const organization=await c.env.DB.prepare('SELECT name,slug FROM organizations WHERE id=?').bind(invitation.organization_id).first();
  if(!organization)emailFail(404,'Invitation not found');
  return c.json({organization,purpose:invitation.purpose,expiresAt:invitation.expires_at,effect:invitation.intent_json?intentDescription(readPersonnelIntent(invitation.intent_json)!):invitation.purpose==='member'?'You are invited to join this organization as a member.':'You are invited to accept Volunteer recognition for three months. This grants no membership permissions.'});
 });
 app.get('/invitations/:id',async c=>{
  const actor=await auth(c.env,c.req.raw),invitation=await recipient(c.env.DB,c.req.param('id'),actor);
  const org=await c.env.DB.prepare('SELECT name,slug FROM organizations WHERE id=?').bind(invitation.organization_id).first();
  return c.json({organizationId:invitation.organization_id,intent:readPersonnelIntent(invitation.intent_json),effect:invitation.intent_json?intentDescription(readPersonnelIntent(invitation.intent_json)!):null,purpose:invitation.purpose,expiresAt:invitation.expires_at,organization:org});
 });
 app.post('/invitations/:id/:operation',async c=>{
  const actor=await auth(c.env,c.req.raw),db=c.env.DB,invitation=await recipient(db,c.req.param('id'),actor),operation=c.req.param('operation');
  if(!['preview','apply'].includes(operation))emailFail(404,'Operation not found');
  await enforceEventRateLimit(db,actor.id);
  const owner={userId:actor.id,organizationId:invitation.organization_id,eventId:`invitation:${invitation.id}`};
  const fingerprint=await previewFingerprint(invitation);
  if(operation==='preview')return c.json({intent:readPersonnelIntent(invitation.intent_json),effect:invitation.intent_json?intentDescription(readPersonnelIntent(invitation.intent_json)!):invitation.purpose==='member'?'Join as a member':'Volunteer recognition only',...await prepareEventOperation(db,owner,fingerprint)});
  const args=receiptSchema.parse(await c.req.json());if(args.confirm!==true||!args.previewId)emailFail(409,'Review and confirm acceptance first');
  await claimEventOperation(db,owner,args.previewId,fingerprint);
  try{
   const now=new Date(),org=invitation.organization_id;
   const claim=db.prepare(`UPDATE organization_invitations SET status='accepting',accepted_user_id=? WHERE id=? AND status='pending' AND expires_at>?
    AND EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=? AND user_id=? AND status='active'
    AND (role IN ('owner','administrator') OR (?='volunteer' AND ? IS NULL)))`).bind(actor.id,invitation.id,now.getTime(),org,invitation.invited_by,invitation.purpose,invitation.intent_json);
   // The conditional insert and claim run in one D1 transaction. Existing active
   // roles are retained; inactive privileged memberships are never reactivated.
   const condition="EXISTS(SELECT 1 FROM organization_invitations WHERE id=? AND status='accepting' AND accepted_user_id=?)";
   const intent=readPersonnelIntent(invitation.intent_json);
   const grant=invitation.purpose==='member'?db.prepare(`INSERT INTO organization_memberships(organization_id,user_id,user_name,user_email,role,status) SELECT ?,?,?,?,'member','active' WHERE ${condition} ON CONFLICT(organization_id,user_id) DO NOTHING`).bind(org,actor.id,actor.full_name||actor.id,invitation.email,invitation.id,actor.id):db.prepare(`INSERT INTO organization_volunteer_awards(organization_id,user_id,awarded_by,awarded_at,expires_at) SELECT ?,?,?,?,? WHERE ${condition} ON CONFLICT(organization_id,user_id) DO UPDATE SET awarded_by=excluded.awarded_by,awarded_at=excluded.awarded_at,expires_at=excluded.expires_at`).bind(org,actor.id,invitation.invited_by,now.toISOString(),monthsAfter(now,3),invitation.id,actor.id);
   const complete=db.prepare("UPDATE organization_invitations SET status='accepted' WHERE id=? AND status='accepting' AND accepted_user_id=?").bind(invitation.id,actor.id);
   const relationships=(intent?.classes||[]).map(key=>db.prepare(`INSERT INTO organization_personnel_relationships(organization_id,user_id,scheme,class_key,user_name,status,accepted_at,expires_at,role_name)
    SELECT ?,?,?,?,?,?,?,?,? WHERE ${condition} ON CONFLICT(organization_id,user_id,scheme,class_key) DO UPDATE SET user_name=excluded.user_name,role_name=excluded.role_name,
     status=CASE WHEN organization_personnel_relationships.expires_at<=excluded.accepted_at THEN excluded.status ELSE organization_personnel_relationships.status END,
     evidence_url=CASE WHEN organization_personnel_relationships.expires_at<=excluded.accepted_at THEN NULL ELSE organization_personnel_relationships.evidence_url END,
     confirmed_by=CASE WHEN organization_personnel_relationships.expires_at<=excluded.accepted_at THEN NULL ELSE organization_personnel_relationships.confirmed_by END,
     accepted_at=excluded.accepted_at,expires_at=excluded.expires_at`).bind(org,actor.id,intent!.scheme,key,actor.full_name||'Organization participant',requiresConfirmation(key)?'pending_confirmation':'active',now.getTime(),Date.parse(monthsAfter(now,24)),intent!.roleNames?.[key]||null,invitation.id,actor.id));
   const applied=await db.batch([claim,...(!intent||intent.access==='member'?[grant]:[]),...relationships,complete]);
   if(!applied[0].meta.changes)emailFail(409,'Invitation expired or already accepted');
   await finishEventOperation(db,args.previewId,true,['accepted']);return c.json({accepted:true,pendingConfirmation:intent?.classes.filter(requiresConfirmation)||[]});
  }catch(e){await finishEventOperation(db,args.previewId,false,[]);throw e}
 });
 return app;
}
export function invitationMessage(base:string,id:string,name:string,purpose:string,intentJson?:string|null){
 const link=`${base}/invitations/${encodeURIComponent(id)}`,effect=intentJson?intentDescription(readPersonnelIntent(intentJson)!):purpose==='member'?'join as a member':'accept Volunteer recognition (no membership permissions)';
 return {subject:`Invitation from ${name}`,text:`You are invited to ${effect} at ${name}. Sign in or create an account using this email address, verify it, then review and accept: ${link}\n\nThis invitation expires in seven days. If unexpected, ignore it.`,html:`<p>You are invited to ${escapeHtml(effect)} at ${escapeHtml(name)}.</p><p><a href="${escapeHtml(link)}">Review invitation</a></p><p>Sign in or create an account with this email address and verify it. Expires in seven days. If unexpected, ignore it.</p>`};
}
/** Operator-only, organization-scoped transactional senders. Never sourced from invitation input. */
export function nativeInvitationSenders(value:string|undefined):Record<string,string>{
 if(!value)return {};
 try{
  const parsed=JSON.parse(value);
  if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'||Object.keys(parsed).length>100)return {};
  const result:Record<string,string>={};
  for(const [org,email] of Object.entries(parsed)){
   if(!org||org.length>200||typeof email!=='string'||!normalizeEmail(email)||normalizeEmail(email)!==email)return {};
   result[org]=email;
  }
  return result;
 }catch{return {}}
}
/** Durable outbox: scoped native transactional delivery or the existing Gmail adapter. */
export async function runOrganizationInvitations(env:Env){
 const db=env.DB,now=Date.now(),nativeSenders=nativeInvitationSenders(env.ORGANIZATION_INVITATION_SENDERS_JSON),nativeOrgs=Object.keys(nativeSenders),gmailEnabled=env.EMAIL_SENDING_ENABLED==='true';
 await db.prepare("UPDATE organization_invitations SET email_status='uncertain' WHERE email_status='sending' AND attempted_at<?").bind(now-180000).run();
 if(!gmailEnabled){
  await db.prepare("UPDATE organization_invitations SET delivery_blocker='sending_disabled' WHERE status='pending' AND email_status='queued'").run();
  if(!nativeOrgs.length)return;
 }
 // Backfill retained provider outcomes into their sender inbox; never replay delivery.
 if(nativeOrgs.length){
  const archived=await db.prepare("SELECT i.*,o.name FROM organization_invitations i JOIN organizations o ON o.id=i.organization_id WHERE i.email_status IN ('sent','uncertain','failed') AND i.attempted_at>? AND i.organization_id IN ("+nativeOrgs.map(()=>'?').join(',')+") AND i.email_archive_ticket_id IS NULL ORDER BY i.attempted_at LIMIT 100").bind(now-90*86400000,...nativeOrgs).all<Invitation&{name:string;email_status:string}>();
  for(const row of archived.results){try{await archiveInvitationMail(env,row,nativeSenders[row.organization_id],invitationMessage(emailPortalBase(env),row.id,row.name,row.purpose,row.intent_json),row.email_status,undefined,true);}catch{console.error('Invitation correspondence backfill deferred');}}
 }
 // Filter before LIMIT so unrelated blocked organizations cannot starve enabled delivery.
 const scoped=gmailEnabled?'':` AND i.organization_id IN (${nativeOrgs.map(()=>'?').join(',')})`;
 const rows=await db.prepare("SELECT i.*,o.name FROM organization_invitations i JOIN organizations o ON o.id=i.organization_id WHERE i.status='pending' AND i.email_status='queued' AND i.expires_at>? AND i.next_attempt_at<=?"+scoped+" ORDER BY i.created_at LIMIT 10").bind(now,now,...(gmailEnabled?[]:nativeOrgs)).all<Invitation&{name:string}>();
 for(const row of rows.results){
  const block=async(reason:string)=>{await db.prepare('UPDATE organization_invitations SET delivery_blocker=? WHERE id=?').bind(reason,row.id).run()};
  if(row.intent_json){try{await managePersonnel(db,row.organization_id,row.invited_by)}catch{await block('inviter_permission');continue}}
  if(!await issuerAllowed(db,row.organization_id,row.invited_by,row.purpose)){await block('inviter_permission');continue;}
  const blocked=await db.prepare('SELECT email FROM email_contact_suppressions WHERE organization_id=? AND email=? UNION SELECT email FROM email_bounces WHERE organization_id=? AND email=?').bind(row.organization_id,row.email,row.organization_id,row.email).first();
  if(blocked){await db.prepare("UPDATE organization_invitations SET email_status='skipped' WHERE id=?").bind(row.id).run();continue}
  const nativeFrom=nativeSenders[row.organization_id];
  if(nativeFrom){
   if(!env.SUPPORT_EMAIL){await block('native_sender_unavailable');continue;}
   const usage=await db.prepare('SELECT count(*) AS n FROM organization_invitations WHERE organization_id=? AND attempted_at>?').bind(row.organization_id,now-86400000).first<{n:number}>();
   if(Number(usage?.n||0)>=emailDailyLimit(env)){await block('daily_limit');continue;}
   const message=invitationMessage(emailPortalBase(env),row.id,row.name,row.purpose,row.intent_json);
   const claimed=await db.prepare("UPDATE organization_invitations SET delivery_blocker=NULL,email_status='sending',attempted_at=?,attempts=attempts+1 WHERE id=? AND email_status='queued' AND status='pending' AND expires_at>? AND (SELECT count(*) FROM organization_invitations WHERE organization_id=? AND attempted_at>?)<? RETURNING id").bind(Date.now(),row.id,Date.now(),row.organization_id,now-86400000,emailDailyLimit(env)).first();
   if(!claimed)continue;
   let status='sent',providerMessageId:string|undefined;
   try{const result=await env.SUPPORT_EMAIL.send({from:{email:nativeFrom,name:row.name},replyTo:nativeFrom,to:row.email,...message});
    if(result&&typeof result==='object'&&'messageId' in result&&typeof result.messageId==='string')providerMessageId=result.messageId;}
   catch{status='uncertain';} // A lost provider response must never trigger duplicate mail.
   await db.prepare("UPDATE organization_invitations SET email_status=?,delivery_blocker=? WHERE id=? AND email_status='sending'").bind(status,status==='sent'?null:'native_delivery_uncertain',row.id).run();
   try{await archiveInvitationMail(env,{...row,attempted_at:Date.now()},nativeFrom,message,status,providerMessageId);}catch{console.error('Invitation correspondence archive deferred');}
   continue;
  }
  if(!gmailEnabled){await block('sending_disabled');continue;}
  const sender=await db.prepare("SELECT s.* FROM email_senders s JOIN organization_memberships m ON m.user_id=s.owner_user_id WHERE m.organization_id=? AND m.status='active' AND m.role IN ('owner','administrator') AND s.status='connected' AND s.cooldown_until<=? ORDER BY s.connected_at LIMIT 1").bind(row.organization_id,now).first<Sender>();
  if(!sender){await block('sender_unavailable_or_cooling_down');continue;}
  const lease=crypto.randomUUID();
  if(!await db.prepare('UPDATE email_senders SET lease_until=?,lease_owner=? WHERE owner_user_id=? AND lease_until<? RETURNING owner_user_id').bind(Date.now()+90000,lease,sender.owner_user_id,Date.now()).first()){await block('sender_busy');continue;}
  try{
   const usage=await db.prepare('SELECT count(*) AS n FROM email_send_attempts WHERE sender_user_id=? AND attempted_at>?').bind(sender.owner_user_id,Date.now()-86400000).first<{n:number}>();
   if(Number(usage?.n||0)>=emailDailyLimit(env)){await block('daily_limit');continue;}
   const token=await googleAccessToken(env,sender);if(!token){await block('sender_reconnect_required');continue;}
   const raw=emailMime(sender.email,{email:row.email,id:row.id},invitationMessage(emailPortalBase(env),row.id,row.name,row.purpose,row.intent_json));
   if(!await db.prepare("UPDATE organization_invitations SET delivery_blocker=NULL,email_status='sending',attempted_at=?,attempts=attempts+1 WHERE id=? AND email_status='queued' AND status='pending' AND expires_at>? RETURNING id").bind(Date.now(),row.id,Date.now()).first())continue;
   await db.prepare('INSERT INTO email_send_attempts(id,sender_user_id,attempted_at) VALUES(?,?,?)').bind(crypto.randomUUID(),sender.owner_user_id,Date.now()).run();
   const result=await sendGmail(token,raw),retry=result.status==='retry'&&row.attempts<2;
   await db.prepare("UPDATE organization_invitations SET email_status=?,next_attempt_at=? WHERE id=? AND email_status='sending'").bind(retry?'queued':result.status==='retry'?'failed':result.status,retry?Date.now()+3600000:0,row.id).run();
   if(result.reconnect)await db.prepare("UPDATE email_senders SET status='reconnect' WHERE owner_user_id=?").bind(sender.owner_user_id).run();
   if(result.status==='retry')await db.prepare('UPDATE email_senders SET cooldown_until=? WHERE owner_user_id=?').bind(Date.now()+3600000,sender.owner_user_id).run();
  }finally{await db.prepare('UPDATE email_senders SET lease_until=0,lease_owner=NULL WHERE owner_user_id=? AND lease_owner=?').bind(sender.owner_user_id,lease).run()}
 }
}
