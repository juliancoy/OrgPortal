import { HTTPException } from 'hono/http-exception';
import { supportMailboxForOrganization } from './supportMailboxes';
export type GuestPresentationActor={id:string;email?:string|null;identity_data?:Record<string,unknown>|null};
export type GuestPresentationEnv={DB:D1Database;SUPPORT_EMAIL?:Env['SUPPORT_EMAIL'];PUBLIC_PORTAL_BASE_URL?:string};
export const claimRecommendation='We recommend claiming your submission to your account to keep event communications and your presentation records organized.';
export function guestClaimPath(eventId:string,submissionId:string){return `/presentation-claims/${encodeURIComponent(eventId)}/${encodeURIComponent(submissionId)}`}
export function escapeGuestHtml(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))}
export async function sendGuestAcknowledgement(env:GuestPresentationEnv,event:{id:string;host_org_id:string;title:string},id:string,email:string){
 const attempt=await env.DB.prepare("UPDATE event_guest_presentations SET acknowledgement_status='sending' WHERE id=? AND event_id=? AND acknowledgement_status='not_requested' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(id,event.id).run();
 if(!attempt.meta.changes)return;
 let status='unavailable';
 try{
  const mailbox=env.SUPPORT_EMAIL?await supportMailboxForOrganization(env.DB,event.host_org_id):null;
  if(mailbox&&env.SUPPORT_EMAIL){
   const origin=new URL(env.PUBLIC_PORTAL_BASE_URL||'https://orgportal.cc');
   if(!['https:','http:'].includes(origin.protocol)||(origin.protocol==='http:'&&!['localhost','127.0.0.1'].includes(origin.hostname)))throw new Error('Invalid portal URL');
   const url=new URL(guestClaimPath(event.id,id),origin).href;
   const instructions='Sign in or create an account with the same email address that received this message, verify that email, then choose “Claim submission”. Your application is already saved; claiming it is optional and does not grant access to an existing organization.';
   status='uncertain'; // A transport exception does not prove that nothing was sent.
   await env.SUPPORT_EMAIL.send({from:{email:mailbox.senderAddress,name:mailbox.organizationName},to:email,replyTo:mailbox.address,
    subject:'Thank you for your presentation submission',
    text:`Thank you for submitting a presentation for ${event.title}. The event organizers have received your application for review.\n\n${claimRecommendation}\n\nClaim your submission: ${url}\n\n${instructions}\n\nIf you did not submit an application, you can ignore this message. This is a submission receipt, not a mailing-list subscription.`,
    html:`<p>Thank you for submitting a presentation for <strong>${escapeGuestHtml(event.title)}</strong>. The event organizers have received your application for review.</p><p>${claimRecommendation}</p><p><a href="${escapeGuestHtml(url)}">Claim your submission</a></p><p>${instructions}</p><p>If you did not submit an application, you can ignore this message. This is a submission receipt, not a mailing-list subscription.</p>`});
   status='accepted';
  }
 }catch{/* Never log recipient addresses, proposal contents or provider responses. */}
 await env.DB.prepare('UPDATE event_guest_presentations SET acknowledgement_status=? WHERE id=? AND event_id=?').bind(status,id,event.id).run();
}
export async function guestClaimApplication(db:D1Database,eventId:string,id:string,user:GuestPresentationActor){
 const row=await db.prepare("SELECT id,event_id,contact_name,email,organization_name,title,summary,claimed_by_user_id,claimed_at FROM event_guest_presentations WHERE id=? AND event_id=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(id,eventId).first<{id:string;event_id:string;contact_name:string;email:string;organization_name:string;title:string;summary:string;claimed_by_user_id:string|null;claimed_at:string|null}>();
 if(!row)throw new HTTPException(404,{message:'Application not found or expired'});
 if(row.claimed_by_user_id){
  if(row.claimed_by_user_id!==user.id)throw new HTTPException(403,{message:'This application is already claimed by another account'});
 }else if(user.email?.trim().toLowerCase()!==row.email||user.identity_data?.email_verified!==true){
  throw new HTTPException(403,{message:'Sign in with the same email address you supplied on the application, and verify that address before claiming it.'});
 }
 return row;
}
