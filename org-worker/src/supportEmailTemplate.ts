import { EMAIL_POSTAL_ADDRESS } from './emailPostalAddress';
import type { SupportMailbox } from './supportMailboxes';
function escape(value:string) { return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
export function renderSupportEmail(mailbox:SupportMailbox, body:string, ticketId:string, automated=false) {
 const reference=mailbox.ticketPrefix+'-'+ticketId;
 const notice=automated?'This is an automatic answer from our reviewed FAQ. Reply if you would like an administrator to help.':'Reply to this email to continue the conversation.';
 const text='Hello,\n\n'+body.trim()+'\n\nKind regards,\n'+mailbox.senderName+'\n'+EMAIL_POSTAL_ADDRESS+'\n\n'+notice+'\nReference: '+reference;
 let image='';
 try { const url=new URL(mailbox.imageUrl||'');if(url.protocol==='https:'&&!url.username&&!url.password)image='<img src="'+escape(url.href)+'" alt="" width="64" style="display:block;margin-bottom:16px;max-width:64px;height:auto">'; } catch { /* Optional organization image. */ }
 const html='<!doctype html><html lang="en"><body style="margin:0;background:#f3f5f7;color:#18212b;font:16px/1.6 Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border-top:4px solid #155e59"><tr><td style="padding:28px">'+image+'<p style="font-size:20px;font-weight:bold">'+escape(mailbox.organizationName)+'</p><p>Hello,</p><div style="overflow-wrap:anywhere">'+escape(body.trim()).replace(/\r?\n/g,'<br>')+'</div><p>Kind regards,<br>'+escape(mailbox.senderName)+'<br>'+escape(EMAIL_POSTAL_ADDRESS)+'</p><hr style="border:0;border-top:1px solid #dde2e8"><p style="font-size:13px;color:#536170">'+escape(notice)+'<br>Reference: '+escape(reference)+'</p></td></tr></table></td></tr></table></body></html>';
 return {text,html};
}
