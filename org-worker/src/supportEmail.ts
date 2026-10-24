import { EmailMessage } from 'cloudflare:email';
import PostalMime from 'postal-mime';
import { createMimeMessage } from 'mimetext';
import { acceptSupportMail, supportEnabled } from './supportTickets';
export async function receiveSupportEmail(message:ForwardableEmailMessage,env:Env){
 if(env.ORGANIZATION_REPLICA_SOURCE||message.to.toLowerCase()!=='service@lifetech.fyi'){message.setReject('Unknown service mailbox');return}
 const org=await env.DB.prepare("SELECT id FROM organizations WHERE slug='lifetech'").first<{id:string}>();
 if(!org||!await supportEnabled(env.DB,org.id)){message.setReject('LifeTech service email processing is currently disabled. Please contact an organizer.');return}
 if(message.rawSize>256*1024){message.setReject('Please send a text question smaller than 256 KiB without attachments.');return}
 const raw=await new Response(message.raw).arrayBuffer();
 if(raw.byteLength>256*1024){message.setReject('Message too large');return}
 const mail=await PostalMime.parse(raw);
 const sender=message.from.toLowerCase();
 if(!sender||sender==='service@lifetech.fyi'||/^(?:mailer-daemon|postmaster|no-?reply)@/i.test(sender))return;
 const automated=!!message.headers.get('Auto-Submitted')&&message.headers.get('Auto-Submitted')?.toLowerCase()!=='no'||/bulk|list|junk/i.test(message.headers.get('Precedence')||'')||!!message.headers.get('List-Id');
 const result=await acceptSupportMail(env.DB,{from:sender,to:message.to,subject:(mail.subject||'').replace(/[\r\n]/g,' '),text:mail.text||'(No plain text supplied; administrator review required.)',messageId:message.headers.get('Message-ID')||'',automated,attachments:!!mail.attachments.length},async text=>{
  const reply=createMimeMessage();reply.setSender({addr:message.to,name:'LifeTech service'});reply.setRecipient(message.from);
  const ticket=text.match(/\[LT-[a-f0-9]{32}\]/)?.[0]||'';
  reply.setSubject('Re: '+ticket+' '+(mail.subject||'Your LifeTech question').replace(/[\r\n]/g,' ').slice(0,300));
  reply.setHeader('Auto-Submitted','auto-replied');
  const id=message.headers.get('Message-ID');if(id){reply.setHeader('In-Reply-To',id);reply.setHeader('References',id)}
  reply.addMessage({contentType:'text/plain',data:text});
  // Cloudflare enforces valid DMARC and one reply per inbound event.
  await message.reply(new EmailMessage(message.to,message.from,reply.asRaw()));
 });
 if('rateLimited' in result)message.setReject('Too many requests from this sender; please try again later.');
}
