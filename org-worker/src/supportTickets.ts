import {sanitizeSupportHtml} from './supportHtml';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { renderSupportEmail } from './supportEmailTemplate';
import { normalizeEmail } from './emailShared';
import { organizationRole } from './organizationIam';
import { supportMailboxForAddress, supportMailboxForOrganization, supportOrganizationForRequest } from './supportMailboxes';

export const categories=['general','membership','technical','privacy','security'] as const;
const categorySchema=z.enum(categories);
type Category=typeof categories[number];
type Ticket={id:string;organization_id:string;sender_email:string;subject:string;category:Category;status:string;assigned_user_id:string|null;created_by_user_id?:string|null};
export type SupportMail={from:string;to:string;subject:string;text:string;html?:string;messageId:string;automated:boolean;attachments:boolean;inReplyTo?:string;references?:string[]};
export function normalizeQuestion(value:string){return value.normalize('NFKC').toLowerCase().replace(/[?!.]+$/g,'').replace(/\s+/g,' ').trim()}
export function supportCategory(text:string):Category{
 if(/\b(security|hacked|vulnerability|breach)\b/i.test(text))return 'security';
 if(/\b(privacy|personal data|delete my|erase my)\b/i.test(text))return 'privacy';
 if(/\b(login|log in|sign in|password|error|bug|mcp|codex)\b/i.test(text))return 'technical';
 if(/\b(join|membership|volunteer|onboarding)\b/i.test(text))return 'membership';
 return 'general';
}
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('')}
async function admins(db:D1Database,org:string){return (await db.prepare("SELECT user_id,user_name FROM organization_memberships WHERE organization_id=? AND status='active' AND role IN ('owner','administrator') ORDER BY user_id").bind(org).all<{user_id:string;user_name:string}>()).results}
async function notify(db:D1Database,ticket:Ticket){
 const eligible=await admins(db,ticket.organization_id);
 const mailbox=await supportMailboxForOrganization(db,ticket.organization_id);
 const recipients=ticket.assigned_user_id&&eligible.some(a=>a.user_id===ticket.assigned_user_id)?eligible.filter(a=>a.user_id===ticket.assigned_user_id):eligible;
 if(recipients.length)await db.batch(recipients.map(recipient=>db.prepare(`INSERT INTO user_notifications(id,user_id,type,actor_user_name,entity_id,title,body,status,created_at)
 VALUES(?,?,'support_ticket',?,?,'Support ticket needs attention',?,'unread',?)
 ON CONFLICT(id) DO UPDATE SET status='unread',read_at=NULL,created_at=excluded.created_at`)
 .bind('support:'+ticket.id+':'+recipient.user_id,recipient.user_id,mailbox?.senderName||'Service desk',ticket.id,ticket.category+' question · Open the private service queue to review.',new Date().toISOString())));
}
export async function acceptSupportMail(db:D1Database,mail:SupportMail,reply:(body:string,ticketId:string)=>Promise<void>){
 const mailbox=await supportMailboxForAddress(db,mail.to);if(!mailbox)throw new Error('Unknown support mailbox');
 if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(mail.from)||mail.from.length>254)throw new Error('Invalid sender');
 const org=await db.prepare('SELECT id FROM organizations WHERE id=?').bind(mailbox.organizationId).first<{id:string}>();if(!org)throw new Error('Support organization missing');
 const dedupe=await hash(mail.to+'\0'+mail.from.toLowerCase()+'\0'+(mail.messageId||mail.subject+'\0'+mail.text+'\0'+(mail.html||'')));
 const duplicate=await db.prepare('SELECT ticket_id FROM support_messages WHERE dedupe_key=?').bind(dedupe).first<{ticket_id:string}>();if(duplicate){const ticket=await db.prepare('SELECT * FROM support_tickets WHERE id=?').bind(duplicate.ticket_id).first<Ticket>();if(ticket?.status==='open')await notify(db,ticket);return {ticketId:duplicate.ticket_id,duplicate:true};}
 const count=await db.prepare(`SELECT count(*) AS n FROM support_messages m JOIN support_tickets t ON t.id=m.ticket_id WHERE t.organization_id=? AND t.sender_email=? AND m.direction='inbound' AND m.created_at>=?`).bind(org.id,mail.from.toLowerCase(),new Date(Date.now()-3600000).toISOString()).first<{n:number}>();
 if((count?.n||0)>=30)return {rateLimited:true};
 const now=new Date().toISOString(),expiry=Date.now()+90*86400000,category=supportCategory(mail.subject+'\n'+mail.text);
 const reference=mail.subject.match(new RegExp('\\['+mailbox.ticketPrefix+'-([a-f0-9]{32})\\]','i'))?.[1];
 let ticket=reference?await db.prepare('SELECT * FROM support_tickets WHERE id=? AND organization_id=? AND sender_email=?').bind(reference,org.id,mail.from.toLowerCase()).first<Ticket>():null;
 if(!ticket){
  const references=[mail.inReplyTo,...(mail.references||[])].filter((id):id is string=>!!id).slice(0,20);
  if(references.length)ticket=await db.prepare("SELECT t.* FROM support_tickets t JOIN support_messages m ON m.ticket_id=t.id WHERE t.organization_id=? AND t.sender_email=? AND m.message_id IN ("+references.map(()=>'?').join(',')+") ORDER BY m.created_at DESC LIMIT 1").bind(org.id,mail.from.toLowerCase(),...references).first<Ticket>();
 }
 if(!ticket&&/^re:\s*/i.test(mail.subject)){
  const subject=mail.subject.replace(/^(?:re:\s*)+/ig,'').trim().toLowerCase();
  const matches=await db.prepare('SELECT * FROM support_tickets WHERE organization_id=? AND sender_email=? AND lower(trim(subject))=? AND expires_at>? LIMIT 2').bind(org.id,mail.from.toLowerCase(),subject,Date.now()).all<Ticket>();
  if(matches.results.length===1)ticket=matches.results[0];
 }
 const existing=!!ticket;
 if(!ticket){const route=await db.prepare('SELECT assigned_user_id FROM support_routes WHERE organization_id=? AND category=?').bind(org.id,category).first<{assigned_user_id:string}>();
  ticket={id:crypto.randomUUID().replaceAll('-',''),organization_id:org.id,sender_email:mail.from.toLowerCase(),subject:mail.subject.slice(0,300)||'(No subject)',category,status:'open',assigned_user_id:route?.assigned_user_id||null};}
 const saved=ticket;
 try{await db.batch([
  existing?db.prepare("UPDATE support_tickets SET status='open',updated_at=?,expires_at=? WHERE id=?").bind(now,expiry,saved.id):db.prepare('INSERT INTO support_tickets(id,organization_id,sender_email,subject,category,status,assigned_user_id,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(saved.id,org.id,saved.sender_email,saved.subject,saved.category,'open',saved.assigned_user_id,now,now,expiry),
  db.prepare("INSERT INTO support_messages(id,ticket_id,dedupe_key,direction,body,delivery,created_at,message_id,body_html) VALUES(?,?,?,'inbound',?,'received',?,?,?)").bind(crypto.randomUUID(),saved.id,dedupe,mail.text.slice(0,50000),now,mail.messageId||null,sanitizeSupportHtml(mail.html)),
 ]);}catch(error){const prior=await db.prepare('SELECT ticket_id FROM support_messages WHERE dedupe_key=?').bind(dedupe).first<{ticket_id:string}>();if(prior)return {ticketId:prior.ticket_id,duplicate:true};throw error}
 const query=normalizeQuestion(mail.text.trim()||mail.subject);
 const matchingFaqs=!existing&&!mail.automated&&!mail.attachments&&!['privacy','security'].includes(category)&&query.length<=500
  ?(await db.prepare('SELECT id,question,answer FROM support_faqs WHERE organization_id=? AND enabled=1 LIMIT 100').bind(org.id).all<{id:string;question:string;answer:string}>()).results.filter(f=>normalizeQuestion(f.question)===query):[];
 const faq=matchingFaqs.length===1?matchingFaqs[0]:null;
 if(faq){
  const id=crypto.randomUUID();await db.prepare("INSERT INTO support_messages(id,ticket_id,direction,body,faq_id,delivery,created_at,body_html) VALUES(?,?,'outbound',?,?,'sending',?,?)").bind(id,saved.id,faq.answer,faq.id,now,sanitizeSupportHtml(renderSupportEmail(mailbox,faq.answer,saved.id,true).html)).run();
  try{await reply(faq.answer,saved.id);
   await db.batch([db.prepare("UPDATE support_messages SET delivery='sent' WHERE id=?").bind(id),db.prepare("UPDATE support_tickets SET status='answered' WHERE id=?").bind(saved.id)]);
   return {ticketId:saved.id,answered:true};
  }catch{await db.prepare("UPDATE support_messages SET delivery='uncertain' WHERE id=?").bind(id).run();}
 }
 await notify(db,saved);return {ticketId:saved.id,answered:false};
}
export async function supportEnabled(db:D1Database,org:string){
 return (await db.prepare('SELECT enabled FROM support_settings WHERE organization_id=?').bind(org).first<{enabled:number}>())?.enabled===1;
}
export function supportRoutes(getUser:(env:Env,request:Request)=>Promise<{id:string;email?:string|null;identity_data?:Record<string,unknown>|null}>){
 const app=new Hono<{Bindings:Env}>();
 app.onError((error,c)=>{if(error instanceof z.ZodError)return c.json({detail:'Invalid support request'},400);if(error instanceof HTTPException)return c.json({detail:error.message},error.status);throw error});
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');if(c.env.ORGANIZATION_REPLICA_SOURCE)throw new HTTPException(503,{message:'Use the primary portal service queue'});await next()});
 async function access(c:Context<{Bindings:Env}>,org:string){const user=await getUser(c.env,c.req.raw);const role=await organizationRole(c.env.DB,org,user.id);if(role!=='owner'&&role!=='administrator')throw new HTTPException(403,{message:'Organization admin access required'});return user}
 async function verifiedMember(c:Context<{Bindings:Env}>,org:string){
  const user=await getUser(c.env,c.req.raw);
  if(!normalizeEmail(user.email)||user.identity_data?.email_verified!==true)throw new HTTPException(403,{message:'Verify your account email before sending organization email'});
  if(!await organizationRole(c.env.DB,org,user.id))throw new HTTPException(403,{message:'Active organization membership required'});
  return user;
 }
 async function ticketAccess(c:Context<{Bindings:Env}>,ticket:Ticket){
  const user=await getUser(c.env,c.req.raw),role=await organizationRole(c.env.DB,ticket.organization_id,user.id);
  if(role==='owner'||role==='administrator')return user;
  await verifiedMember(c,ticket.organization_id);
  if(ticket.created_by_user_id!==user.id)throw new HTTPException(403,{message:'This correspondence is private'});
  return user;
 }
 async function sendingLimit(c:Context<{Bindings:Env}>,userId:string){
  const row=await c.env.DB.prepare("SELECT count(*) AS n FROM support_messages WHERE author_id=? AND direction='outbound' AND created_at>=?").bind(userId,new Date(Date.now()-3600000).toISOString()).first<{n:number}>();
  if((row?.n||0)>=30)throw new HTTPException(429,{message:'Sending limit reached. Try again later.'});
 }
 app.get('/',async c=>{const offset=Math.max(0,Math.min(100000,Math.floor(Number(c.req.query('offset'))||0)));const user=await getUser(c.env,c.req.raw);const rows=await c.env.DB.prepare("SELECT t.*, EXISTS(SELECT 1 FROM support_messages sm WHERE sm.ticket_id=t.id AND sm.direction='inbound') AS has_inbound, EXISTS(SELECT 1 FROM support_messages sm WHERE sm.ticket_id=t.id AND sm.direction='outbound') AS has_outbound FROM support_tickets t JOIN organization_memberships m ON m.organization_id=t.organization_id WHERE m.user_id=? AND m.status='active' AND (m.role IN ('owner','administrator') OR (t.created_by_user_id=? AND ?=1)) ORDER BY t.updated_at DESC,t.id DESC LIMIT 101 OFFSET ?").bind(user.id,user.id,Number(!!normalizeEmail(user.email)&&user.identity_data?.email_verified===true),offset).all();const organizations=(await c.env.DB.prepare("SELECT o.id,o.name FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id WHERE m.user_id=? AND m.status='active' ORDER BY lower(o.name)").bind(user.id).all()).results;const preferredOrganizationId=await supportOrganizationForRequest(c.env.DB,c.req.raw);return c.json({tickets:rows.results.slice(0,100),nextOffset:rows.results.length>100?offset+100:null,organizations,defaultOrganizationId:organizations.some(o=>o.id===preferredOrganizationId)?preferredOrganizationId:null})});
 app.get('/settings/:org',async c=>{const org=c.req.param('org');const user=await getUser(c.env,c.req.raw),role=await organizationRole(c.env.DB,org,user.id);if(!role)throw new HTTPException(403);const mailbox=await supportMailboxForOrganization(c.env.DB,org);const canManage=role==='owner'||role==='administrator';return c.json({canManage,canSend:!!normalizeEmail(user.email)&&user.identity_data?.email_verified===true,activation:{enabled:await supportEnabled(c.env.DB,org),sendingConfigured:!!c.env.SUPPORT_EMAIL,mailboxAddress:mailbox?.address||null},faqs:canManage?(await c.env.DB.prepare('SELECT * FROM support_faqs WHERE organization_id=? ORDER BY updated_at DESC LIMIT 100').bind(org).all()).results:[],routes:canManage?(await c.env.DB.prepare('SELECT * FROM support_routes WHERE organization_id=?').bind(org).all()).results:[],admins:canManage?await admins(c.env.DB,org):[]})});
 app.put('/settings/:org/activation',async c=>{
  const org=c.req.param('org'),user=await access(c,org);
  const {enabled}=z.object({enabled:z.boolean()}).strict().parse(await c.req.json());
  if(enabled){
   if(!await supportMailboxForOrganization(c.env.DB,org))throw new HTTPException(400,{message:'No service mailbox is configured for this organization'});
   if(!c.env.SUPPORT_EMAIL)throw new HTTPException(503,{message:'Configure support email sending before enabling processing'});
  }
  await c.env.DB.prepare('INSERT INTO support_settings(organization_id,enabled,updated_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(organization_id) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(org,Number(enabled),user.id,new Date().toISOString()).run();
  return c.json({enabled});
 });
 app.put('/settings/:org/faq',async c=>{const org=c.req.param('org'),user=await access(c,org);const args=z.object({id:z.string().max(100).optional(),question:z.string().trim().min(5).max(500),answer:z.string().trim().min(5).max(10000),source_url:z.string().url().startsWith('https://'),enabled:z.boolean()}).strict().parse(await c.req.json());
  const id=args.id||crypto.randomUUID();if(args.id&&!await c.env.DB.prepare('SELECT id FROM support_faqs WHERE id=? AND organization_id=?').bind(id,org).first())throw new HTTPException(404,{message:'FAQ not found'});
  await c.env.DB.prepare('INSERT INTO support_faqs(id,organization_id,question,answer,source_url,enabled,reviewed_by,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET question=excluded.question,answer=excluded.answer,source_url=excluded.source_url,enabled=excluded.enabled,reviewed_by=excluded.reviewed_by,updated_at=excluded.updated_at').bind(id,org,args.question,args.answer,args.source_url,Number(args.enabled),user.id,new Date().toISOString()).run();return c.json({id})});
 app.put('/settings/:org/route',async c=>{const org=c.req.param('org');await access(c,org);const a=z.object({category:categorySchema,assigned_user_id:z.string().nullable()}).strict().parse(await c.req.json());if(a.assigned_user_id&&!(await admins(c.env.DB,org)).some(u=>u.user_id===a.assigned_user_id))throw new HTTPException(400,{message:'Select an active organization admin'});
  if(a.assigned_user_id)await c.env.DB.prepare('INSERT INTO support_routes VALUES(?,?,?) ON CONFLICT(organization_id,category) DO UPDATE SET assigned_user_id=excluded.assigned_user_id').bind(org,a.category,a.assigned_user_id).run();else await c.env.DB.prepare('DELETE FROM support_routes WHERE organization_id=? AND category=?').bind(org,a.category).run();return c.json({saved:true})});
 const composeSchema=z.object({to:z.string().email().max(254),subject:z.string().trim().min(1).max(240).regex(/^[^\r\n\0]+$/),body:z.string().trim().min(1).max(10000),requestId:z.string().uuid()}).strict();
 app.post('/compose/:org/:action',async c=>{
  const org=c.req.param('org'),user=await verifiedMember(c,org),action=c.req.param('action');
  if(action!=='preview'&&action!=='send')throw new HTTPException(404);
  const a=composeSchema.parse(await c.req.json()),mailbox=await supportMailboxForOrganization(c.env.DB,org);
  if(!mailbox||!c.env.SUPPORT_EMAIL||!await supportEnabled(c.env.DB,org))throw new HTTPException(409,{message:'An administrator must configure and enable organization email first'});
  const ticketId=a.requestId.replaceAll('-',''),rendered=renderSupportEmail(mailbox,a.body,ticketId);
  const subject='['+mailbox.ticketPrefix+'-'+ticketId+'] '+a.subject;
  if(action==='preview')return c.json({to:a.to,from:mailbox.senderName+' <'+mailbox.senderAddress+'>',replyTo:mailbox.address,subject,...rendered});
  const prior=await c.env.DB.prepare('SELECT t.created_by_user_id,t.sender_email,t.subject,m.body,m.delivery FROM support_tickets t JOIN support_messages m ON m.ticket_id=t.id WHERE t.id=? AND t.organization_id=? AND m.id=?').bind(ticketId,org,a.requestId).first<{created_by_user_id:string;sender_email:string;subject:string;body:string;delivery:string}>();
  if(prior){if(prior.created_by_user_id!==user.id||prior.sender_email!==normalizeEmail(a.to)||prior.subject!==a.subject||prior.body!==a.body)throw new HTTPException(409,{message:'Email request changed'});if(prior.delivery==='sent')return c.json({sent:true,ticketId});throw new HTTPException(409,{message:'This email was already attempted. Check correspondence before retrying.'});}
  await sendingLimit(c,user.id);
  const now=new Date().toISOString();
  await c.env.DB.batch([
   c.env.DB.prepare("INSERT INTO support_tickets(id,organization_id,sender_email,subject,category,status,created_at,updated_at,expires_at,created_by_user_id) VALUES(?,?,?,?,'general','open',?,?,?,?)").bind(ticketId,org,normalizeEmail(a.to),a.subject,now,now,Date.now()+90*86400000,user.id),
   c.env.DB.prepare("INSERT INTO support_messages(id,ticket_id,direction,body,author_id,delivery,created_at,body_html) VALUES(?,?,'outbound',?,?,'sending',?,?)").bind(a.requestId,ticketId,a.body,user.id,now,sanitizeSupportHtml(rendered.html)),
  ]);
  try{await c.env.SUPPORT_EMAIL.send({from:{email:mailbox.senderAddress,name:mailbox.senderName},to:normalizeEmail(a.to),replyTo:mailbox.address,subject,...rendered});}
  catch{await c.env.DB.prepare("UPDATE support_messages SET delivery='uncertain' WHERE id=?").bind(a.requestId).run();throw new HTTPException(502,{message:'Delivery could not be confirmed. Check correspondence before retrying.'});}
  await c.env.DB.prepare("UPDATE support_messages SET delivery='sent' WHERE id=?").bind(a.requestId).run();
  return c.json({sent:true,ticketId});
 });
 app.get('/:id',async c=>{
  const ticket=await c.env.DB.prepare("SELECT t.*, EXISTS(SELECT 1 FROM support_messages sm WHERE sm.ticket_id=t.id AND sm.direction='inbound') AS has_inbound, EXISTS(SELECT 1 FROM support_messages sm WHERE sm.ticket_id=t.id AND sm.direction='outbound') AS has_outbound FROM support_tickets t WHERE t.id=?").bind(c.req.param('id')).first<Ticket>();if(!ticket)throw new HTTPException(404);await ticketAccess(c,ticket);
  const before=Number(c.req.query('before'))||0;
  const cursor=before?await c.env.DB.prepare('SELECT created_at FROM support_messages WHERE ticket_id=? AND rowid=?').bind(ticket.id,before).first<{created_at:string}>():null;
  if(before&&!cursor)throw new HTTPException(400,{message:'Invalid conversation cursor'});
  const clause=cursor?' AND (created_at<? OR (created_at=? AND rowid<?))':'';
  const messages=await c.env.DB.prepare('SELECT rowid AS message_cursor,* FROM support_messages WHERE ticket_id=?'+clause+' ORDER BY created_at DESC,rowid DESC LIMIT 201').bind(ticket.id,...(cursor?[cursor.created_at,cursor.created_at,before]:[])).all<{message_cursor:number}>();
  const page=messages.results.slice(0,200).reverse();
  return c.json({ticket,messages:page,nextBefore:messages.results.length>200?page[0].message_cursor:null});
 });
 app.patch('/:id',async c=>{const t=await c.env.DB.prepare('SELECT * FROM support_tickets WHERE id=?').bind(c.req.param('id')).first<Ticket>();if(!t)throw new HTTPException(404);await access(c,t.organization_id);const a=z.object({status:z.enum(['open','answered','closed']),assigned_user_id:z.string().nullable()}).strict().parse(await c.req.json());if(a.assigned_user_id&&!(await admins(c.env.DB,t.organization_id)).some(u=>u.user_id===a.assigned_user_id))throw new HTTPException(400);await c.env.DB.prepare('UPDATE support_tickets SET status=?,assigned_user_id=?,updated_at=?,expires_at=? WHERE id=?').bind(a.status,a.assigned_user_id,new Date().toISOString(),Date.now()+90*86400000,t.id).run();if(a.status==='open'&&a.assigned_user_id!==t.assigned_user_id)await notify(c.env.DB,{...t,assigned_user_id:a.assigned_user_id});return c.json({saved:true})});
 app.post('/:id/reply-preview',async c=>{
  const t=await c.env.DB.prepare('SELECT * FROM support_tickets WHERE id=?').bind(c.req.param('id')).first<Ticket>();if(!t)throw new HTTPException(404);
  await verifiedMember(c,t.organization_id);await ticketAccess(c,t);
  const {body}=z.object({body:z.string().trim().min(1).max(10000)}).strict().parse(await c.req.json());
  const mailbox=await supportMailboxForOrganization(c.env.DB,t.organization_id);if(!mailbox)throw new HTTPException(404);
  return c.json({from:mailbox.senderName+' <'+mailbox.senderAddress+'>',to:t.sender_email,subject:'Re: ['+mailbox.ticketPrefix+'-'+t.id+'] '+t.subject,...renderSupportEmail(mailbox,body,t.id)});
 });
 app.post('/:id/reply',async c=>{const t=await c.env.DB.prepare('SELECT * FROM support_tickets WHERE id=?').bind(c.req.param('id')).first<Ticket>();if(!t)throw new HTTPException(404);const user=await verifiedMember(c,t.organization_id);await ticketAccess(c,t);const a=z.object({body:z.string().trim().min(1).max(10000),requestId:z.string().uuid()}).strict().parse(await c.req.json());if(!await supportEnabled(c.env.DB,t.organization_id))throw new HTTPException(409,{message:'Service email processing is disabled'});if(!c.env.SUPPORT_EMAIL)throw new HTTPException(503,{message:'Support email sending is not configured'});
  const mailbox=await supportMailboxForOrganization(c.env.DB,t.organization_id);if(!mailbox)throw new HTTPException(400,{message:'No service mailbox is configured for this organization'});
  const id=a.requestId,now=new Date().toISOString();
  const prior=await c.env.DB.prepare('SELECT ticket_id,body,delivery FROM support_messages WHERE id=?').bind(id).first<{ticket_id:string;body:string;delivery:string}>();
  if(prior){if(prior.ticket_id!==t.id||prior.body!==a.body)throw new HTTPException(409,{message:'Reply request changed'});if(prior.delivery==='sent')return c.json({sent:true});throw new HTTPException(409,{message:'This reply was already attempted. Check delivery before composing another reply.'})}
  await sendingLimit(c,user.id);
  const claimed=await c.env.DB.prepare("INSERT OR IGNORE INTO support_messages(id,ticket_id,direction,body,author_id,delivery,created_at,body_html) VALUES(?,?,'outbound',?,?,'sending',?,?)").bind(id,t.id,a.body,user.id,now,sanitizeSupportHtml(renderSupportEmail(mailbox,a.body,t.id).html)).run();
  if(!claimed.meta.changes)throw new HTTPException(409,{message:'Reply is already being processed'});
  const inbound=await c.env.DB.prepare("SELECT message_id FROM support_messages WHERE ticket_id=? AND direction='inbound' AND message_id IS NOT NULL ORDER BY rowid DESC LIMIT 1").bind(t.id).first<{message_id:string}>();
  try{await c.env.SUPPORT_EMAIL.send({from:{email:mailbox.senderAddress,name:mailbox.senderName},inReplyTo:inbound?.message_id,to:t.sender_email,subject:'Re: ['+mailbox.ticketPrefix+'-'+t.id+'] '+t.subject,replyTo:mailbox.address,...renderSupportEmail(mailbox,a.body,t.id)});}
  catch{await c.env.DB.prepare("UPDATE support_messages SET delivery='uncertain' WHERE id=?").bind(id).run();await notify(c.env.DB,t);throw new HTTPException(502,{message:'Delivery could not be confirmed. Check correspondence before retrying.'})}
  await c.env.DB.batch([c.env.DB.prepare("UPDATE support_messages SET delivery='sent' WHERE id=?").bind(id),c.env.DB.prepare("UPDATE support_tickets SET status='answered',updated_at=?,expires_at=? WHERE id=?").bind(now,Date.now()+90*86400000,t.id)]);return c.json({sent:true})});
 app.delete('/:id',async c=>{const t=await c.env.DB.prepare('SELECT * FROM support_tickets WHERE id=?').bind(c.req.param('id')).first<Ticket>();if(!t)throw new HTTPException(404);await access(c,t.organization_id);await c.env.DB.batch([c.env.DB.prepare("DELETE FROM user_notifications WHERE type='support_ticket' AND entity_id=?").bind(t.id),c.env.DB.prepare('DELETE FROM support_messages WHERE ticket_id=?').bind(t.id),c.env.DB.prepare('DELETE FROM support_tickets WHERE id=?').bind(t.id)]);return c.json({deleted:true})});
 return app;
}
