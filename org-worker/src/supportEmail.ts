import { renderSupportEmail } from './supportEmailTemplate';
import { supportMailboxForAddress } from './supportMailboxes';
import { EmailMessage } from 'cloudflare:email';
import PostalMime from 'postal-mime';
import { createMimeMessage } from 'mimetext';
import { acceptSupportMail, supportEnabled } from './supportTickets';
export async function receiveSupportEmail(message:ForwardableEmailMessage,env:Env){
 if(env.ORGANIZATION_REPLICA_SOURCE){message.setReject('Use the primary portal service queue');return}
 const mailbox=await supportMailboxForAddress(env.DB,message.to);
 if(!mailbox){message.setReject('Unknown service mailbox');return}
 const org=await env.DB.prepare('SELECT id FROM organizations WHERE id=?').bind(mailbox.organizationId).first<{id:string}>();
 if(!org||!await supportEnabled(env.DB,org.id)){message.setReject('Service email processing is currently disabled. Please contact an organizer.');return}
 if(message.rawSize>256*1024){message.setReject('Please send a text question smaller than 256 KiB without attachments.');return}
 const raw=await new Response(message.raw).arrayBuffer();
 if(raw.byteLength>256*1024){message.setReject('Message too large');return}
 const mail=await PostalMime.parse(raw);
 const sender=message.from.toLowerCase();
 if(!sender||(sender===mailbox.address||sender===mailbox.senderAddress)||/^(?:mailer-daemon|postmaster|no-?reply)@/i.test(sender))return;
 const automated=!!message.headers.get('Auto-Submitted')&&message.headers.get('Auto-Submitted')?.toLowerCase()!=='no'||/bulk|list|junk/i.test(message.headers.get('Precedence')||'')||!!message.headers.get('List-Id');
 const result=await acceptSupportMail(env.DB,{from:sender,to:message.to,subject:(mail.subject||'').replace(/[\r\n]/g,' '),text:mail.text||'(No plain text supplied; administrator review required.)',messageId:message.headers.get('Message-ID')||'',automated,attachments:!!mail.attachments.length},async (body,ticketId)=>{
  const reply=createMimeMessage();reply.setSender({addr:message.to,name:mailbox.senderName});reply.setRecipient(message.from);
  const ticket='['+mailbox.ticketPrefix+'-'+ticketId+']';
  reply.setSubject('Re: '+ticket+' '+(mail.subject||'Your service question').replace(/[\r\n]/g,' ').slice(0,300));
  reply.setHeader('Auto-Submitted','auto-replied');
  const id=message.headers.get('Message-ID');if(id){reply.setHeader('In-Reply-To',id);reply.setHeader('References',id)}
  const rendered=renderSupportEmail(mailbox,body,ticketId,true);
  reply.addMessage({contentType:'text/plain',data:rendered.text});
  reply.addMessage({contentType:'text/html',data:rendered.html});
  // Cloudflare enforces valid DMARC and one reply per inbound event.
  await message.reply(new EmailMessage(message.to,message.from,reply.asRaw()));
 });
 if('rateLimited' in result)message.setReject('Too many requests from this sender; please try again later.');
}
