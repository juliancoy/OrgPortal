import { supportMailboxForOrganization } from './supportMailboxes';
import { normalizeEmail } from './emailShared';
import { escapeGuestHtml } from './guestPresentationAccounts';
import type { GuestPresentationEnv } from './guestPresentationAccounts';

type NotificationEnv = GuestPresentationEnv & { ORGANIZATION_REPLICA_SOURCE?: string };
type Notice = { id:number; event_id:string; organization_id:string; source:'team'|'guest'; submission_id:string; user_id:string; attempts:number };
type Proposal = { title:string; summary:string; team:string };

export async function presentationHostNotificationsAvailable(db:D1Database) {
 return !!await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='presentation_host_notifications'").first();
}

async function reviewUrl(env:NotificationEnv,organizationId:string,slug:string) {
 const tenant=await env.DB.prepare('SELECT hostname,canonical_path_prefix FROM group_sites WHERE organization_id=? ORDER BY id LIMIT 1')
  .bind(organizationId).first<{hostname:string;canonical_path_prefix:string}>();
 const publicHost=tenant&&/^[a-z0-9.-]+$/i.test(tenant.hostname)&&!/(^localhost$|\.(local|localhost|internal|test|invalid)$)/i.test(tenant.hostname)&&!/^\d+(?:\.\d+){3}$/.test(tenant.hostname);
 const base=new URL(publicHost?`https://${tenant.hostname}`:env.PUBLIC_PORTAL_BASE_URL||'https://orgportal.cc');
 if(base.protocol!=='https:'||base.username||base.password)throw new Error('Invalid portal URL');
 const prefix=publicHost?tenant.canonical_path_prefix||'':'';
 base.pathname=`${prefix}/events/${encodeURIComponent(slug)}`.replace(/\/{2,}/g,'/');
 base.search='?tab=submissions';base.hash='submissions';
 return base.href;
}

export function renderPresentationHostEmail(eventTitle:string,proposal:Proposal,url:string,guest:boolean) {
 const subject=`New presentation submission: ${eventTitle}`.replace(/[\r\n]/g,' ').slice(0,250);
 const intro=`${proposal.team} submitted a presentation for ${eventTitle}.`;
 const review=guest?'Sign in and open Manage submissions → Applications without login to review the contact details.':'Sign in and open Manage submissions to review this application.';
 return {subject,text:`${intro}\n\n${proposal.title}\n\n${proposal.summary}\n\n${review}\n${url}`,
  html:`<p>${escapeGuestHtml(intro)}</p><h2>${escapeGuestHtml(proposal.title)}</h2><p style="white-space:pre-wrap">${escapeGuestHtml(proposal.summary)}</p><p>${escapeGuestHtml(review)}</p><p><a href="${escapeGuestHtml(url)}">Review submissions</a></p>`};
}

/** The submission and its outbox are committed together by database triggers.
 * Cron sends individual messages; no request-lifetime promises or bulk recipient lists.
 * Unknown transport outcomes stay uncertain for operator review, never blind retry.
 */
export async function runPresentationHostEmail(env:NotificationEnv) {
 const counts={accepted:0,queued:0,uncertain:0,failed:0,skipped:0};
 if(env.ORGANIZATION_REPLICA_SOURCE||!await presentationHostNotificationsAvailable(env.DB))return counts;
 const started=Date.now();
 await env.DB.prepare("UPDATE presentation_host_notifications SET status='uncertain',error_code='interrupted' WHERE status='sending' AND attempted_at<?").bind(started-300_000).run();
 if(!env.SUPPORT_EMAIL)return counts;
 const notices=await env.DB.prepare("SELECT * FROM presentation_host_notifications WHERE status='queued' AND next_attempt_at<=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') ORDER BY next_attempt_at,id LIMIT 25")
  .bind(started).all<Notice>();
 for(const notice of notices.results){
  if(Date.now()-started>25_000)break;
  // Resolve identity and authority afresh: host changes and revocations suppress mail.
  const recipient=await env.DB.prepare(`SELECT e.title,e.slug,p.email AS preference_email,c.user_email AS contact_email
   FROM events e JOIN organization_memberships m ON m.organization_id=e.host_org_id
   LEFT JOIN notification_preferences p ON p.user_id=m.user_id LEFT JOIN user_contact_pages c ON c.user_id=m.user_id
   WHERE e.id=? AND e.host_org_id=? AND m.user_id=? AND m.status='active' AND m.role IN ('owner','administrator')`)
   .bind(notice.event_id,notice.organization_id,notice.user_id).first<{title:string;slug:string;preference_email:string|null;contact_email:string|null}>();
  const proposal=notice.source==='guest'
   ?await env.DB.prepare("SELECT title,summary,organization_name AS team FROM event_guest_presentations WHERE id=? AND event_id=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(notice.submission_id,notice.event_id).first<Proposal>()
   :await env.DB.prepare("SELECT s.title,s.summary,o.name AS team FROM event_submissions s JOIN organizations o ON o.id=s.organization_id WHERE s.submission_id=? AND s.event_id=? AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(notice.submission_id,notice.event_id).first<Proposal>();
  if(!recipient||!proposal){
   await env.DB.prepare("UPDATE presentation_host_notifications SET status='skipped',error_code='access_or_application_removed' WHERE id=? AND status='queued'").bind(notice.id).run();counts.skipped++;continue;
  }
  const email=normalizeEmail(recipient.preference_email)||normalizeEmail(recipient.contact_email);
  if(!email){
   await env.DB.prepare("UPDATE presentation_host_notifications SET next_attempt_at=?,error_code='recipient_email_unavailable' WHERE id=? AND status='queued'").bind(started+3600_000,notice.id).run();counts.queued++;continue;
  }
  let message:Parameters<NonNullable<NotificationEnv['SUPPORT_EMAIL']>['send']>[0];
  try{
   const mailbox=await supportMailboxForOrganization(env.DB,notice.organization_id);
   if(!mailbox)throw new Error('Mailbox unavailable');
   message={from:{email:mailbox.senderAddress,name:mailbox.organizationName},to:email,replyTo:mailbox.address,
    ...renderPresentationHostEmail(recipient.title,proposal,await reviewUrl(env,notice.organization_id,recipient.slug),notice.source==='guest')};
  }catch{
   await env.DB.prepare("UPDATE presentation_host_notifications SET next_attempt_at=?,error_code='mail_configuration_unavailable' WHERE id=? AND status='queued'").bind(started+3600_000,notice.id).run();counts.queued++;continue;
  }
  const claimed=await env.DB.prepare(`UPDATE presentation_host_notifications SET status='sending',attempted_at=?,attempts=attempts+1,error_code=NULL
   WHERE id=? AND status='queued' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
   AND EXISTS(SELECT 1 FROM events e JOIN organization_memberships m ON m.organization_id=e.host_org_id
    WHERE e.id=presentation_host_notifications.event_id AND e.host_org_id=presentation_host_notifications.organization_id
    AND m.user_id=presentation_host_notifications.user_id AND m.status='active' AND m.role IN ('owner','administrator'))`)
   .bind(Date.now(),notice.id).run();
  if(!claimed.meta.changes)continue;
  let status:'accepted'|'queued'|'uncertain'|'failed'='accepted',errorCode:string|null=null,next=0;
  try{await env.SUPPORT_EMAIL.send(message)}catch(error){
   const code=error&&typeof error==='object'&&'code'in error?String(error.code):'';
   // Only known pre-delivery rejections are automatically retried.
   if(['E_RATE_LIMIT_EXCEEDED','E_DAILY_LIMIT_EXCEEDED','E_SENDER_NOT_VERIFIED','E_SENDER_DOMAIN_NOT_AVAILABLE','E_ACCOUNT_SUSPENDED','E_RECIPIENT_NOT_ALLOWED'].includes(code)){
    status='queued';errorCode=code;next=Date.now()+Math.min(6*3600_000,60_000*2**Math.min(notice.attempts,9));
   }else if(['E_VALIDATION_ERROR','E_FIELD_MISSING','E_RECIPIENT_SUPPRESSED','E_CONTENT_TOO_LARGE','E_DELIVERY_FAILED'].includes(code)){
    status='failed';errorCode=code;
   }else{status='uncertain';errorCode='transport_outcome_unknown'}
  }
  // If persisting this receipt fails, the sending lease becomes uncertain on cron.
  await env.DB.prepare("UPDATE presentation_host_notifications SET status=?,error_code=?,next_attempt_at=? WHERE id=? AND status='sending'").bind(status,errorCode,next,notice.id).run();
  counts[status]++;
 }
 return counts;
}
