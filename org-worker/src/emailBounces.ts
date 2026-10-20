import { Hono } from 'hono';
import { z } from 'zod';
import { requireEmailOrganizer, emailAudit } from './emailAccess';
import { senderFor, googleAccessToken, type Sender } from './emailGoogle';
import { decodeBase64, emailFail, normalizeEmail, type EmailActor, type EmailCampaign } from './emailShared';
type Part={mimeType?:string;headers?:{name:string;value:string}[];body?:{data?:string};parts?:Part[]};
export function bounceEvidence(part:Part){let text='';const ids:string[]=[];function walk(p:Part){for(const h of p.headers||[])if(h.name.toLowerCase()==='message-id')ids.push(h.value);if(p.body?.data&&p.body.data.length<50000){try{text+='\n'+new TextDecoder().decode(decodeBase64(p.body.data))}catch{/* Ignore malformed provider data. */}}for(const q of p.parts||[])walk(q)}walk(part);if(!/Action:\s*failed/i.test(text)||!/Status:\s*5\./i.test(text))return null;const email=normalizeEmail(text.match(/Final-Recipient:\s*rfc822;\s*([^\s<>]+)/i)?.[1]);for(const m of text.matchAll(/(?:Original-Message-ID|Message-ID):\s*(<[^<>\r\n]+>)/gi))ids.push(m[1]);const deliveryIds=ids.map(v=>v.match(/<([a-zA-Z0-9-]{16,80})@[^>]+>/)?.[1]).filter((x):x is string=>Boolean(x));return email?{email,deliveryIds,reason:(text.match(/Diagnostic-Code:\s*smtp;([^\n]*(?:\n[ \t]+[^\n]*)*)/i)?.[1]||'Permanent recipient delivery failure').replace(/\s+/g,' ').trim().slice(0,1000)}:null;}
export async function recordBounce(env:Env,campaign:EmailCampaign,email:string,noticeId:string,reason:string){
 const now=Date.now();await env.DB.batch([
  env.DB.prepare(`UPDATE email_deliveries SET bounced_at=COALESCE(bounced_at,?),bounce_notice_id=?,error=? WHERE campaign_id=? AND email=? AND kind='campaign' AND status='sent'`).bind(now,noticeId,reason,campaign.id,email),
  env.DB.prepare(`INSERT INTO email_bounces(organization_id,email,reason,source_message_id,first_seen_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(organization_id,email) DO UPDATE SET reason=excluded.reason,source_message_id=excluded.source_message_id,updated_at=excluded.updated_at`).bind(campaign.organization_id,email,reason,noticeId,now,now),
  env.DB.prepare(`UPDATE email_deliveries SET status='skipped',error='Previous delivery failure.' WHERE email=? AND kind='campaign' AND status IN ('draft','queued') AND campaign_id IN(SELECT id FROM email_campaigns WHERE organization_id=?)`).bind(email,campaign.organization_id),
 ]);
}
export async function syncSenderBounces(env:Env,sender:Sender,token:string){
 if(!sender.can_read_bounces)emailFail(409,'Reconnect Google with delivery-failure monitoring enabled.');
 const url=new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');url.search=new URLSearchParams({maxResults:'50',q:'newer_than:30d {from:mailer-daemon from:postmaster subject:"Delivery Status Notification"}',...(sender.bounce_page_token?{pageToken:sender.bounce_page_token}:{})}).toString();
 const get=async(url:string)=>{const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},redirect:'manual',signal:AbortSignal.timeout(4000)});if(!r.ok)emailFail(503,'Gmail delivery monitoring is unavailable. Reconnect Google or try again.');return r.json()};
 const list=await get(url.toString()) as {messages?:{id:string}[];nextPageToken?:string};let processed=0,matched=0,remaining=false;
 for(const row of list.messages||[]){if(await env.DB.prepare('SELECT message_id FROM email_bounce_receipts WHERE owner_user_id=? AND message_id=? AND expires_at>?').bind(sender.owner_user_id,row.id,Date.now()).first())continue;if(processed>=10){remaining=true;break}
  const message=await get(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(row.id)}?format=full`) as {payload:Part};const evidence=bounceEvidence(message.payload);
  if(evidence)for(const id of evidence.deliveryIds){const c=await env.DB.prepare(`SELECT c.* FROM email_campaigns c JOIN email_deliveries d ON d.campaign_id=c.id WHERE d.id=? AND d.sender_user_id=? AND d.email=? AND d.status='sent'`).bind(id,sender.owner_user_id,evidence.email).first<EmailCampaign>();if(c){await requireEmailOrganizer(env,{id:sender.owner_user_id},c.organization_id);await recordBounce(env,c,evidence.email,row.id,evidence.reason);matched++;break}}
  await env.DB.prepare('INSERT OR REPLACE INTO email_bounce_receipts(owner_user_id,message_id,expires_at) VALUES(?,?,?)').bind(sender.owner_user_id,row.id,Date.now()+30*86400000).run();processed++;
 }
 if(!remaining)await env.DB.prepare('UPDATE email_senders SET bounce_page_token=? WHERE owner_user_id=?').bind(list.nextPageToken||null,sender.owner_user_id).run();
 return {processed,matched,has_more:remaining||Boolean(list.nextPageToken)};
}
export function emailBounceRoutes(getUser:(env:Env,r:Request)=>Promise<EmailActor>){const routes=new Hono<{Bindings:Env}>();
 routes.post('/:id/sync-bounces',async c=>{const u=await getUser(c.env,c.req.raw),campaign=await c.env.DB.prepare('SELECT * FROM email_campaigns WHERE id=? AND owner_user_id=?').bind(c.req.param('id'),u.id).first<EmailCampaign>();if(!campaign)emailFail(400,'Campaign not found.');await requireEmailOrganizer(c.env,u,campaign.organization_id);const s=await senderFor(c.env,u.id);if(!s)emailFail(409,'Connect Google first.');const t=await googleAccessToken(c.env,s);if(!t)emailFail(409,'Reconnect Google first.');return c.json(await syncSenderBounces(c.env,s,t))});
 routes.post('/:id/bounce',async c=>{const u=await getUser(c.env,c.req.raw),campaign=await c.env.DB.prepare('SELECT * FROM email_campaigns WHERE id=? AND owner_user_id=?').bind(c.req.param('id'),u.id).first<EmailCampaign>();if(!campaign)emailFail(400,'Campaign not found.');await requireEmailOrganizer(c.env,u,campaign.organization_id);const a=z.object({email:z.string().email(),notice_id:z.string().min(1).max(200),reason:z.string().min(10).max(1000)}).strict().parse(await c.req.json());const email=normalizeEmail(a.email);if(!await c.env.DB.prepare("SELECT id FROM email_deliveries WHERE campaign_id=? AND email=? AND status='sent' AND kind='campaign'").bind(campaign.id,email).first())emailFail(400,'Choose a Gmail-accepted campaign recipient.');await recordBounce(c.env,campaign,email,a.notice_id,a.reason);await emailAudit(c.env,u.id,campaign.organization_id,'campaign.bounce-recorded',campaign.id,1).run();return c.json({recorded:true})});
 return routes;
}
