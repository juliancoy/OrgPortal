import { supportMailboxForAddress } from './supportMailboxes';

export type InvitationMailRecord={id:string;organization_id:string;email:string;invited_by:string;attempted_at?:number|null};
/** Archive a delivered/attempted transactional email without sending or changing membership. */
export async function archiveInvitationMail(env:Env,record:InvitationMailRecord,from:string,message:{subject:string;text:string},delivery:string,providerMessageId?:string,reconstructed=false){
 const mailbox=await supportMailboxForAddress(env.DB,from);
 // A sender must resolve to one specific inbox; never guess from a shared sending domain.
 if(!mailbox)return;
 const archived=await env.DB.prepare('SELECT email_archive_ticket_id FROM organization_invitations WHERE id=?').bind(record.id).first<{email_archive_ticket_id:string|null}>();
 if(archived?.email_archive_ticket_id)return;
 const messageId='invitation:'+record.id;
 const existing=await env.DB.prepare('SELECT ticket_id FROM support_messages WHERE id=?').bind(messageId).first<{ticket_id:string}>();
 if(existing){await env.DB.prepare('UPDATE organization_invitations SET email_archive_ticket_id=? WHERE id=?').bind(existing.ticket_id,record.id).run();return;}
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(messageId));
 const ticketId=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('').slice(0,32);
 const sentAt=record.attempted_at||Date.now(),date=new Date(sentAt).toISOString(),expiry=sentAt+90*86400000;
 if(expiry<=Date.now())return;
 const body=(reconstructed?'Archived invitation reconstructed from its saved record; original MIME headers are unavailable.\n\n':'')+message.text;
 await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO support_tickets(id,organization_id,sender_email,subject,category,status,created_at,updated_at,expires_at,created_by_user_id) VALUES(?,?,?,?,'membership',?,?,?,?,?)").bind(ticketId,mailbox.organizationId,record.email,message.subject,delivery==='sent'?'answered':'open',date,date,expiry,record.invited_by),
  env.DB.prepare("INSERT OR IGNORE INTO support_messages(id,ticket_id,direction,body,author_id,delivery,created_at,message_id) VALUES(?,?,'outbound',?,?,?,?,?)").bind(messageId,ticketId,body,record.invited_by,delivery,date,providerMessageId||null),
  env.DB.prepare('UPDATE organization_invitations SET email_archive_ticket_id=? WHERE id=? AND email_archive_ticket_id IS NULL').bind(ticketId,record.id),
 ]);
}
