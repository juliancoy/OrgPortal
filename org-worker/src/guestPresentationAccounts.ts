import { insertOwnedOrganization } from './organizationCreation';
import { HTTPException } from 'hono/http-exception';
import { supportMailboxForOrganization } from './supportMailboxes';
export type GuestPresentationActor={id:string;email?:string|null;identity_data?:Record<string,unknown>|null};
export type GuestPresentationEnv={DB:D1Database;SUPPORT_EMAIL?:Env['SUPPORT_EMAIL'];PUBLIC_PORTAL_BASE_URL?:string};
export const teammateInvitationNotice='Include a teammate’s email address. After you claim your submission with your verified account, we’ll create your team organization and invite that teammate by email to join it.';
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
   const instructions='Sign in or create an account with the same email address that received this message, verify that email, then confirm that you want to claim the submission, create your team, and invite your teammate. Your application is already saved. Claiming it creates your team organization and invites the teammate whose email you supplied; it does not grant access to an existing organization.';
   status='uncertain'; // A transport exception does not prove that nothing was sent.
   await env.SUPPORT_EMAIL.send({from:{email:mailbox.senderAddress,name:mailbox.organizationName},to:email,replyTo:mailbox.address,
    subject:'Thank you for your presentation submission',
    text:`Thank you for submitting a presentation for ${event.title}. The event organizers have received your application for review.\n\n${claimRecommendation}\n\n${teammateInvitationNotice}\n\nClaim your submission: ${url}\n\n${instructions}\n\nIf you did not submit an application, you can ignore this message. This is a submission receipt, not a mailing-list subscription.`,
    html:`<p>Thank you for submitting a presentation for <strong>${escapeGuestHtml(event.title)}</strong>. The event organizers have received your application for review.</p><p>${claimRecommendation}</p><p>${teammateInvitationNotice}</p><p><a href="${escapeGuestHtml(url)}">Claim your submission</a></p><p>${instructions}</p><p>If you did not submit an application, you can ignore this message. This is a submission receipt, not a mailing-list subscription.</p>`});
   status='accepted';
  }
 }catch{/* Never log recipient addresses, proposal contents or provider responses. */}
 await env.DB.prepare('UPDATE event_guest_presentations SET acknowledgement_status=? WHERE id=? AND event_id=?').bind(status,id,event.id).run();
}
export async function guestClaimApplication(db:D1Database,eventId:string,id:string,user:GuestPresentationActor){
 const row=await db.prepare("SELECT id,event_id,contact_name,email,organization_name,title,summary,claimed_by_user_id,claimed_at,teammate_email,organization_id,teammate_invitation_id FROM event_guest_presentations WHERE id=? AND event_id=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(id,eventId).first<{id:string;event_id:string;contact_name:string;email:string;organization_name:string;title:string;summary:string;claimed_by_user_id:string|null;claimed_at:string|null;teammate_email:string|null;organization_id:string|null;teammate_invitation_id:string|null}>();
 if(!row)throw new HTTPException(404,{message:'Application not found or expired'});
 if(row.claimed_by_user_id){
  if(row.claimed_by_user_id!==user.id)throw new HTTPException(403,{message:'This application is already claimed by another account'});
 }else if(user.email?.trim().toLowerCase()!==row.email||user.identity_data?.email_verified!==true){
  throw new HTTPException(403,{message:'Sign in with the same email address you supplied on the application, and verify that address before claiming it.'});
 }
 return row;
}

/** Only called after verified-email claim. Stable IDs make partial setup retries safe. */
export async function createGuestPresentationTeam(env:GuestPresentationEnv,eventId:string,id:string,user:GuestPresentationActor){
 const row=await guestClaimApplication(env.DB,eventId,id,user);
 if(row.claimed_by_user_id!==user.id||!row.teammate_email)throw new HTTPException(409,{message:'Claim the application and supply a teammate email first'});
 const teamId=`guest-team-${id}`;
 const team=await insertOwnedOrganization(env.DB,{id:user.id,name:row.contact_name,email:row.email,isOperator:false},{id:teamId,name:row.organization_name,slug:teamId,tags:JSON.stringify(['Team'])});
 const invitationId=`guest-teammate-${id}`,now=Date.now();
 await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO organization_invitations(id,organization_id,email,purpose,invited_by,created_at,expires_at) VALUES(?,?,?,'member',?,?,?)").bind(invitationId,teamId,row.teammate_email,user.id,now,now+7*86400000),
  env.DB.prepare('UPDATE event_guest_presentations SET organization_id=?,teammate_invitation_id=? WHERE id=? AND event_id=? AND claimed_by_user_id=?').bind(teamId,invitationId,id,eventId,user.id),
 ]);
 const invitation=await env.DB.prepare('SELECT email_status,status FROM organization_invitations WHERE id=?').bind(invitationId).first<{email_status:string;status:string}>();
 if(invitation?.email_status==='queued'&&invitation.status==='pending'&&env.SUPPORT_EMAIL){
  const event=await env.DB.prepare('SELECT host_org_id FROM events WHERE id=?').bind(eventId).first<{host_org_id:string}>();
  const mailbox=event?await supportMailboxForOrganization(env.DB,event.host_org_id):null;
  if(mailbox){
   const attempt=await env.DB.prepare("UPDATE organization_invitations SET email_status='sending',attempted_at=?,attempts=attempts+1 WHERE id=? AND email_status='queued' AND status='pending' AND expires_at>?").bind(now,invitationId,now).run();
   if(attempt.meta.changes){
    let status='uncertain';
    try{
     const url=new URL(`/invitations/${encodeURIComponent(invitationId)}`,env.PUBLIC_PORTAL_BASE_URL||'https://orgportal.cc').href;
     const name=String(team!.name);
     await env.SUPPORT_EMAIL.send({from:{email:mailbox.senderAddress,name:mailbox.organizationName},to:row.teammate_email,replyTo:mailbox.address,subject:'Invitation to join '+name.replace(/[\r\n]/g,' '),
      text:`You have been invited to join ${name} as a teammate for an event presentation.\n\nReview and accept your invitation: ${url}\n\nSign in or create an account with the email address that received this invitation, then verify it. You join only if you accept. This invitation expires in seven days.`,
      html:`<p>You have been invited to join <strong>${escapeGuestHtml(name)}</strong> as a teammate for an event presentation.</p><p><a href="${escapeGuestHtml(url)}">Review and accept your invitation</a></p><p>Sign in or create an account with the email address that received this invitation, then verify it. You join only if you accept. This invitation expires in seven days.</p>`});
     status='sent';
    }catch{/* Preserve uncertain delivery; never automatically duplicate an ambiguous send. */}
    await env.DB.prepare('UPDATE organization_invitations SET email_status=? WHERE id=?').bind(status,invitationId).run();
   }
  }
 }
 return {organizationId:teamId,invitationId};
}
