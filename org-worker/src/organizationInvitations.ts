import { z } from 'zod';
import { EventIntegrationError } from './eventPlatforms';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { organizationRole } from './organizationIam';
import { normalizeEmail, emailFail, emailPortalBase, emailDailyLimit } from './emailShared';
import { prepareEventOperation, claimEventOperation, finishEventOperation, previewFingerprint, enforceEventRateLimit } from './eventOperationStore';
import { monthsAfter } from './organizationPersonnel';
import { googleAccessToken, sendGmail, type Sender } from './emailGoogle';
import { emailMime, escapeHtml } from './emailTemplate';
type Actor={id:string;email?:string|null;full_name?:string|null;identity_data?:Record<string,unknown>|null};
const receiptSchema=z.object({previewId:z.string().uuid().optional(),confirm:z.boolean().optional()}).strict();
const issueSchema=receiptSchema.extend({email:z.string().max(254),purpose:z.enum(['member','volunteer'])});
type Invitation={id:string;organization_id:string;email:string;purpose:'member'|'volunteer';invited_by:string;created_at:number;expires_at:number;status:string;attempts:number};
async function issuerAllowed(db:D1Database,org:string,user:string,purpose:string){const role=await organizationRole(db,org,user);return !!role&&(purpose==='volunteer'||role==='owner'||role==='administrator')}
export function verifiedInvitationRecipient(actor:Actor,email:string){return normalizeEmail(actor.email)===email&&actor.identity_data?.email_verified===true}
export function organizationInvitationRoutes(auth:(env:Env,req:Request)=>Promise<Actor>){
 const app=new Hono<{Bindings:Env}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next()});
 app.onError((e,c)=>e instanceof HTTPException?e.getResponse():e instanceof z.ZodError?c.json({error:'Invalid invitation request'},400):e instanceof EventIntegrationError?c.json({error:e.message},e.status as ContentfulStatusCode):c.json({error:'Could not process invitation'},500));
 app.post('/orgs/:org/invitations/:operation',async c=>{
  const actor=await auth(c.env,c.req.raw),db=c.env.DB,org=c.req.param('org'),operation=c.req.param('operation');
  if(!['preview','apply'].includes(operation))emailFail(404,'Operation not found');
  const args=issueSchema.parse(await c.req.json()),email=normalizeEmail(args.email),purpose=args.purpose;
  if(!email||!['member','volunteer'].includes(purpose))emailFail(400,'Choose a valid email and invitation type');
  if(!await issuerAllowed(db,org,actor.id,purpose))emailFail(403,'Organization permission required');
  const organization=await db.prepare('SELECT name FROM organizations WHERE id=?').bind(org).first<{name:string}>();
  if(!organization)emailFail(404,'Organization not found');
  await enforceEventRateLimit(db,actor.id);
  const owner={userId:actor.id,organizationId:org,eventId:'organization:invite'};
  const fingerprint=await previewFingerprint({email,purpose});
  if(operation==='preview')return c.json({email,purpose,organization:organization.name,...await prepareEventOperation(db,owner,fingerprint)});
  if(args.confirm!==true||!args.previewId)emailFail(409,'Review and confirm the invitation first');
  await claimEventOperation(db,owner,args.previewId,fingerprint);
  try{
   const now=Date.now();
   await db.prepare("DELETE FROM organization_invitations WHERE organization_id=? AND email=? AND purpose=? AND expires_at<=?").bind(org,email,purpose,now).run();
   await db.prepare('INSERT OR IGNORE INTO organization_invitations(id,organization_id,email,purpose,invited_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),org,email,purpose,actor.id,now,now+7*86400000).run();
   await finishEventOperation(db,args.previewId,true,['invite']);
   const pending=await db.prepare("SELECT id FROM organization_invitations WHERE organization_id=? AND email=? AND purpose=? AND status='pending'").bind(org,email,purpose).first<{id:string}>();
   return c.json({saved:true,invitationId:pending?.id,message:'Invitation queued. It expires in seven days.'});
  }catch(e){await finishEventOperation(db,args.previewId,false,[]);throw e}
 });
 async function recipient(db:D1Database,id:string,actor:Actor){
  const invitation=await db.prepare('SELECT id,organization_id,email,purpose,invited_by,created_at,expires_at,status FROM organization_invitations WHERE id=?').bind(id).first<Invitation>();
  if(!invitation||!verifiedInvitationRecipient(actor,invitation.email))emailFail(403,'Sign in with the verified email address that received this invitation');
  if(invitation.status!=='pending'||invitation.expires_at<=Date.now())emailFail(409,'Invitation expired or already accepted');
  if(!await issuerAllowed(db,invitation.organization_id,invitation.invited_by,invitation.purpose))emailFail(409,'The inviter no longer has permission');
  const existing=await db.prepare('SELECT status FROM organization_memberships WHERE organization_id=? AND user_id=?').bind(invitation.organization_id,actor.id).first<{status:string}>();
  if(invitation.purpose==='member'&&existing?.status==='inactive')emailFail(409,'Ask an organizer to restore your existing inactive membership');
  return invitation;
 }
 app.get('/invitations/:id',async c=>{
  const actor=await auth(c.env,c.req.raw),invitation=await recipient(c.env.DB,c.req.param('id'),actor);
  const org=await c.env.DB.prepare('SELECT name,slug FROM organizations WHERE id=?').bind(invitation.organization_id).first();
  return c.json({purpose:invitation.purpose,expiresAt:invitation.expires_at,organization:org});
 });
 app.post('/invitations/:id/:operation',async c=>{
  const actor=await auth(c.env,c.req.raw),db=c.env.DB,invitation=await recipient(db,c.req.param('id'),actor),operation=c.req.param('operation');
  if(!['preview','apply'].includes(operation))emailFail(404,'Operation not found');
  await enforceEventRateLimit(db,actor.id);
  const owner={userId:actor.id,organizationId:invitation.organization_id,eventId:`invitation:${invitation.id}`};
  const fingerprint=await previewFingerprint(invitation);
  if(operation==='preview')return c.json({...await prepareEventOperation(db,owner,fingerprint)});
  const args=receiptSchema.parse(await c.req.json());if(args.confirm!==true||!args.previewId)emailFail(409,'Review and confirm acceptance first');
  await claimEventOperation(db,owner,args.previewId,fingerprint);
  try{
   const now=new Date(),org=invitation.organization_id;
   const claim=db.prepare("UPDATE organization_invitations SET status='accepting',accepted_user_id=? WHERE id=? AND status='pending' AND expires_at>?").bind(actor.id,invitation.id,now.getTime());
   // The conditional insert and claim run in one D1 transaction. Existing active
   // roles are retained; inactive privileged memberships are never reactivated.
   const condition="EXISTS(SELECT 1 FROM organization_invitations WHERE id=? AND status='accepting' AND accepted_user_id=?)";
   const grant=invitation.purpose==='member'?db.prepare(`INSERT INTO organization_memberships(organization_id,user_id,user_name,user_email,role,status) SELECT ?,?,?,?,'member','active' WHERE ${condition} ON CONFLICT(organization_id,user_id) DO NOTHING`).bind(org,actor.id,actor.full_name||actor.id,invitation.email,invitation.id,actor.id):db.prepare(`INSERT INTO organization_volunteer_awards(organization_id,user_id,awarded_by,awarded_at,expires_at) SELECT ?,?,?,?,? WHERE ${condition} ON CONFLICT(organization_id,user_id) DO UPDATE SET awarded_by=excluded.awarded_by,awarded_at=excluded.awarded_at,expires_at=excluded.expires_at`).bind(org,actor.id,invitation.invited_by,now.toISOString(),monthsAfter(now,3),invitation.id,actor.id);
   const complete=db.prepare("UPDATE organization_invitations SET status='accepted' WHERE id=? AND status='accepting' AND accepted_user_id=?").bind(invitation.id,actor.id);
   const applied=await db.batch([claim,grant,complete]);
   if(!applied[0].meta.changes)emailFail(409,'Invitation expired or already accepted');
   await finishEventOperation(db,args.previewId,true,['accepted']);return c.json({accepted:true});
  }catch(e){await finishEventOperation(db,args.previewId,false,[]);throw e}
 });
 return app;
}
export function invitationMessage(base:string,id:string,name:string,purpose:string){
 const link=`${base}/invitations/${encodeURIComponent(id)}`,effect=purpose==='member'?'join as a member':'accept Volunteer recognition (no membership permissions)';
 return {subject:`Invitation from ${name}`,text:`You are invited to ${effect} at ${name}. Sign in or create an account using this email address, verify it, then review and accept: ${link}\n\nThis invitation expires in seven days. If unexpected, ignore it.`,html:`<p>You are invited to ${escapeHtml(effect)} at ${escapeHtml(name)}.</p><p><a href="${escapeHtml(link)}">Review invitation</a></p><p>Sign in or create an account with this email address and verify it. Expires in seven days. If unexpected, ignore it.</p>`};
}
/** Durable outbox; reuse the existing Gmail adapter, sender lease and quota. */
export async function runOrganizationInvitations(env:Env){
 const db=env.DB,now=Date.now();
 await db.prepare("UPDATE organization_invitations SET email_status='uncertain' WHERE email_status='sending' AND attempted_at<?").bind(now-180000).run();
 if(env.EMAIL_SENDING_ENABLED!=='true')return;
 const rows=await db.prepare("SELECT i.*,o.name FROM organization_invitations i JOIN organizations o ON o.id=i.organization_id WHERE i.status='pending' AND i.email_status='queued' AND i.expires_at>? AND i.next_attempt_at<=? ORDER BY i.created_at LIMIT 10").bind(now,now).all<Invitation&{name:string}>();
 for(const row of rows.results){
  if(!await issuerAllowed(db,row.organization_id,row.invited_by,row.purpose))continue;
  const blocked=await db.prepare('SELECT email FROM email_contact_suppressions WHERE organization_id=? AND email=? UNION SELECT email FROM email_bounces WHERE organization_id=? AND email=?').bind(row.organization_id,row.email,row.organization_id,row.email).first();
  if(blocked){await db.prepare("UPDATE organization_invitations SET email_status='skipped' WHERE id=?").bind(row.id).run();continue}
  const sender=await db.prepare("SELECT s.* FROM email_senders s JOIN organization_memberships m ON m.user_id=s.owner_user_id WHERE m.organization_id=? AND m.status='active' AND m.role IN ('owner','administrator') AND s.status='connected' AND s.cooldown_until<=? ORDER BY s.connected_at LIMIT 1").bind(row.organization_id,now).first<Sender>();
  if(!sender)continue;
  const lease=crypto.randomUUID();
  if(!await db.prepare('UPDATE email_senders SET lease_until=?,lease_owner=? WHERE owner_user_id=? AND lease_until<? RETURNING owner_user_id').bind(Date.now()+90000,lease,sender.owner_user_id,Date.now()).first())continue;
  try{
   const usage=await db.prepare('SELECT count(*) AS n FROM email_send_attempts WHERE sender_user_id=? AND attempted_at>?').bind(sender.owner_user_id,Date.now()-86400000).first<{n:number}>();
   if(Number(usage?.n||0)>=emailDailyLimit(env))continue;
   const token=await googleAccessToken(env,sender);if(!token)continue;
   const raw=emailMime(sender.email,{email:row.email,id:row.id},invitationMessage(emailPortalBase(env),row.id,row.name,row.purpose));
   if(!await db.prepare("UPDATE organization_invitations SET email_status='sending',attempted_at=?,attempts=attempts+1 WHERE id=? AND email_status='queued' AND status='pending' AND expires_at>? RETURNING id").bind(Date.now(),row.id,Date.now()).first())continue;
   await db.prepare('INSERT INTO email_send_attempts(id,sender_user_id,attempted_at) VALUES(?,?,?)').bind(crypto.randomUUID(),sender.owner_user_id,Date.now()).run();
   const result=await sendGmail(token,raw),retry=result.status==='retry'&&row.attempts<2;
   await db.prepare("UPDATE organization_invitations SET email_status=?,next_attempt_at=? WHERE id=? AND email_status='sending'").bind(retry?'queued':result.status==='retry'?'failed':result.status,retry?Date.now()+3600000:0,row.id).run();
   if(result.reconnect)await db.prepare("UPDATE email_senders SET status='reconnect' WHERE owner_user_id=?").bind(sender.owner_user_id).run();
   if(result.status==='retry')await db.prepare('UPDATE email_senders SET cooldown_until=? WHERE owner_user_id=?').bind(Date.now()+3600000,sender.owner_user_id).run();
  }finally{await db.prepare('UPDATE email_senders SET lease_until=0,lease_owner=NULL WHERE owner_user_id=? AND lease_owner=?').bind(sender.owner_user_id,lease).run()}
 }
}
