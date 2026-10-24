import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { organizationRole } from './organizationIam';

export const categories=['general','membership','technical','privacy','security'] as const;
const categorySchema=z.enum(categories);
type Category=typeof categories[number];
type Ticket={id:string;organization_id:string;sender_email:string;subject:string;category:Category;status:string;assigned_user_id:string|null};
export type SupportMail={from:string;to:string;subject:string;text:string;messageId:string;automated:boolean;attachments:boolean};
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
 const recipients=ticket.assigned_user_id&&eligible.some(a=>a.user_id===ticket.assigned_user_id)?eligible.filter(a=>a.user_id===ticket.assigned_user_id):eligible;
 if(recipients.length)await db.batch(recipients.map(recipient=>db.prepare(`INSERT INTO user_notifications(id,user_id,type,actor_user_name,entity_id,title,body,status,created_at)
 VALUES(?,?,'support_ticket','LifeTech service',?,'Support ticket needs attention',?,'unread',?)
 ON CONFLICT(id) DO UPDATE SET status='unread',read_at=NULL,created_at=excluded.created_at`)
 .bind('support:'+ticket.id+':'+recipient.user_id,recipient.user_id,ticket.id,ticket.category+' question · Open the private service queue to review.',new Date().toISOString())));
}
export async function acceptSupportMail(db:D1Database,mail:SupportMail,reply:(text:string)=>Promise<void>){
 if(mail.to.toLowerCase()!=='service@lifetech.fyi')throw new Error('Unknown support mailbox');
 if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(mail.from)||mail.from.length>254)throw new Error('Invalid sender');
 const org=await db.prepare("SELECT id FROM organizations WHERE slug='lifetech'").first<{id:string}>();if(!org)throw new Error('Support organization missing');
 const dedupe=await hash(mail.to+'\0'+mail.from.toLowerCase()+'\0'+(mail.messageId||mail.subject+'\0'+mail.text));
 const duplicate=await db.prepare('SELECT ticket_id FROM support_messages WHERE dedupe_key=?').bind(dedupe).first<{ticket_id:string}>();if(duplicate){const ticket=await db.prepare('SELECT * FROM support_tickets WHERE id=?').bind(duplicate.ticket_id).first<Ticket>();if(ticket?.status==='open')await notify(db,ticket);return {ticketId:duplicate.ticket_id,duplicate:true};}
 const count=await db.prepare(`SELECT count(*) AS n FROM support_messages m JOIN support_tickets t ON t.id=m.ticket_id WHERE t.organization_id=? AND t.sender_email=? AND m.direction='inbound' AND m.created_at>=?`).bind(org.id,mail.from.toLowerCase(),new Date(Date.now()-3600000).toISOString()).first<{n:number}>();
 if((count?.n||0)>=30)return {rateLimited:true};
 const now=new Date().toISOString(),expiry=Date.now()+90*86400000,category=supportCategory(mail.subject+'\n'+mail.text);
 const reference=mail.subject.match(/\[LT-([a-f0-9]{32})\]/i)?.[1];
 let ticket=reference?await db.prepare('SELECT * FROM support_tickets WHERE id=? AND organization_id=? AND sender_email=?').bind(reference,org.id,mail.from.toLowerCase()).first<Ticket>():null;
 const existing=!!ticket;
 if(!ticket){const route=await db.prepare('SELECT assigned_user_id FROM support_routes WHERE organization_id=? AND category=?').bind(org.id,category).first<{assigned_user_id:string}>();
  ticket={id:crypto.randomUUID().replaceAll('-',''),organization_id:org.id,sender_email:mail.from.toLowerCase(),subject:mail.subject.slice(0,300)||'(No subject)',category,status:'open',assigned_user_id:route?.assigned_user_id||null};}
 const saved=ticket;
 try{await db.batch([
  existing?db.prepare("UPDATE support_tickets SET status='open',updated_at=?,expires_at=? WHERE id=?").bind(now,expiry,saved.id):db.prepare('INSERT INTO support_tickets(id,organization_id,sender_email,subject,category,status,assigned_user_id,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(saved.id,org.id,saved.sender_email,saved.subject,saved.category,'open',saved.assigned_user_id,now,now,expiry),
  db.prepare("INSERT INTO support_messages(id,ticket_id,dedupe_key,direction,body,delivery,created_at) VALUES(?,?,?,'inbound',?,'received',?)").bind(crypto.randomUUID(),saved.id,dedupe,mail.text.slice(0,50000),now),
 ]);}catch(error){const prior=await db.prepare('SELECT ticket_id FROM support_messages WHERE dedupe_key=?').bind(dedupe).first<{ticket_id:string}>();if(prior)return {ticketId:prior.ticket_id,duplicate:true};throw error}
 const query=normalizeQuestion(mail.text.trim()||mail.subject);
 const matchingFaqs=!existing&&!mail.automated&&!mail.attachments&&!['privacy','security'].includes(category)&&query.length<=500
  ?(await db.prepare('SELECT id,question,answer FROM support_faqs WHERE organization_id=? AND enabled=1 LIMIT 100').bind(org.id).all<{id:string;question:string;answer:string}>()).results.filter(f=>normalizeQuestion(f.question)===query):[];
 const faq=matchingFaqs.length===1?matchingFaqs[0]:null;
 if(faq){
  const id=crypto.randomUUID();await db.prepare("INSERT INTO support_messages(id,ticket_id,direction,body,faq_id,delivery,created_at) VALUES(?,?,'outbound',?,?,'sending',?)").bind(id,saved.id,faq.answer,faq.id,now).run();
  try{await reply(faq.answer+'\n\nLifeTech service · automated answer from our FAQ.\nTicket [LT-'+saved.id+']. Reply to this email if you need an administrator.');
   await db.batch([db.prepare("UPDATE support_messages SET delivery='sent' WHERE id=?").bind(id),db.prepare("UPDATE support_tickets SET status='answered' WHERE id=?").bind(saved.id)]);
   return {ticketId:saved.id,answered:true};
  }catch{await db.prepare("UPDATE support_messages SET delivery='uncertain' WHERE id=?").bind(id).run();}
 }
 await notify(db,saved);return {ticketId:saved.id,answered:false};
}
export async function supportEnabled(db:D1Database,org:string){
 return (await db.prepare('SELECT enabled FROM support_settings WHERE organization_id=?').bind(org).first<{enabled:number}>())?.enabled===1;
}
export function supportRoutes(getUser:(env:Env,request:Request)=>Promise<{id:string}>){
 const app=new Hono<{Bindings:Env}>();
 app.onError((error,c)=>{if(error instanceof z.ZodError)return c.json({detail:'Invalid support request'},400);if(error instanceof HTTPException)return c.json({detail:error.message},error.status);throw error});
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');if(c.env.ORGANIZATION_REPLICA_SOURCE)throw new HTTPException(503,{message:'Use the primary portal service queue'});await next()});
 async function access(c:Context<{Bindings:Env}>,org:string){const user=await getUser(c.env,c.req.raw);const role=await organizationRole(c.env.DB,org,user.id);if(role!=='owner'&&role!=='administrator')throw new HTTPException(403,{message:'Organization admin access required'});return user}
 app.get('/',async c=>{const user=await getUser(c.env,c.req.raw);const rows=await c.env.DB.prepare("SELECT t.* FROM support_tickets t JOIN organization_memberships m ON m.organization_id=t.organization_id WHERE m.user_id=? AND m.status='active' AND m.role IN ('owner','administrator') ORDER BY t.updated_at DESC LIMIT 100").bind(user.id).all();const organizations=(await c.env.DB.prepare("SELECT o.id,o.name FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id WHERE m.user_id=? AND m.status='active' AND m.role IN ('owner','administrator') ORDER BY lower(o.name)").bind(user.id).all()).results;return c.json({tickets:rows.results,organizations})});
 app.get('/settings/:org',async c=>{const org=c.req.param('org');await access(c,org);return c.json({activation:{enabled:await supportEnabled(c.env.DB,org),sendingConfigured:!!c.env.SUPPORT_EMAIL,mailboxAvailable:!!await c.env.DB.prepare("SELECT id FROM organizations WHERE id=? AND slug='lifetech'").bind(org).first()},faqs:(await c.env.DB.prepare('SELECT * FROM support_faqs WHERE organization_id=? ORDER BY updated_at DESC LIMIT 100').bind(org).all()).results,routes:(await c.env.DB.prepare('SELECT * FROM support_routes WHERE organization_id=?').bind(org).all()).results,admins:await admins(c.env.DB,org)})});
 app.put('/settings/:org/activation',async c=>{
  const org=c.req.param('org'),user=await access(c,org);
  const {enabled}=z.object({enabled:z.boolean()}).strict().parse(await c.req.json());
  if(enabled){
   if(!await c.env.DB.prepare("SELECT id FROM organizations WHERE id=? AND slug='lifetech'").bind(org).first())throw new HTTPException(400,{message:'No service mailbox is configured for this organization'});
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
 app.get('/:id',async c=>{const t=await c.env.DB.prepare('SELECT * FROM support_tickets WHERE id=?').bind(c.req.param('id')).first<Ticket>();if(!t)throw new HTTPException(404);await access(c,t.organization_id);const messages=await c.env.DB.prepare('SELECT * FROM support_messages WHERE ticket_id=? ORDER BY rowid DESC LIMIT 200').bind(t.id).all();return c.json({ticket:t,messages:messages.results.reverse()})});
 app.patch('/:id',async c=>{const t=await c.env.DB.prepare('SELECT * FROM support_tickets WHERE id=?').bind(c.req.param('id')).first<Ticket>();if(!t)throw new HTTPException(404);await access(c,t.organization_id);const a=z.object({status:z.enum(['open','answered','closed']),assigned_user_id:z.string().nullable()}).strict().parse(await c.req.json());if(a.assigned_user_id&&!(await admins(c.env.DB,t.organization_id)).some(u=>u.user_id===a.assigned_user_id))throw new HTTPException(400);await c.env.DB.prepare('UPDATE support_tickets SET status=?,assigned_user_id=?,updated_at=?,expires_at=? WHERE id=?').bind(a.status,a.assigned_user_id,new Date().toISOString(),Date.now()+90*86400000,t.id).run();if(a.status==='open'&&a.assigned_user_id!==t.assigned_user_id)await notify(c.env.DB,{...t,assigned_user_id:a.assigned_user_id});return c.json({saved:true})});
 app.post('/:id/reply',async c=>{const t=await c.env.DB.prepare('SELECT * FROM support_tickets WHERE id=?').bind(c.req.param('id')).first<Ticket>();if(!t)throw new HTTPException(404);const user=await access(c,t.organization_id);const a=z.object({body:z.string().trim().min(1).max(10000),requestId:z.string().uuid()}).strict().parse(await c.req.json());if(!await supportEnabled(c.env.DB,t.organization_id))throw new HTTPException(409,{message:'Service email processing is disabled'});if(!c.env.SUPPORT_EMAIL)throw new HTTPException(503,{message:'Support email sending is not configured'});
  const id=a.requestId,now=new Date().toISOString();
  const prior=await c.env.DB.prepare('SELECT ticket_id,body,delivery FROM support_messages WHERE id=?').bind(id).first<{ticket_id:string;body:string;delivery:string}>();
  if(prior){if(prior.ticket_id!==t.id||prior.body!==a.body)throw new HTTPException(409,{message:'Reply request changed'});if(prior.delivery==='sent')return c.json({sent:true});throw new HTTPException(409,{message:'This reply was already attempted. Check delivery before composing another reply.'})}
  const claimed=await c.env.DB.prepare("INSERT OR IGNORE INTO support_messages(id,ticket_id,direction,body,author_id,delivery,created_at) VALUES(?,?,'outbound',?,?,'sending',?)").bind(id,t.id,a.body,user.id,now).run();
  if(!claimed.meta.changes)throw new HTTPException(409,{message:'Reply is already being processed'});
  try{await c.env.SUPPORT_EMAIL.send({from:{email:'service@lifetech.fyi',name:'LifeTech service'},to:t.sender_email,subject:'Re: [LT-'+t.id+'] '+t.subject,text:a.body});}
  catch{await c.env.DB.prepare("UPDATE support_messages SET delivery='uncertain' WHERE id=?").bind(id).run();await notify(c.env.DB,t);throw new HTTPException(502,{message:'Delivery could not be confirmed. Check correspondence before retrying.'})}
  await c.env.DB.batch([c.env.DB.prepare("UPDATE support_messages SET delivery='sent' WHERE id=?").bind(id),c.env.DB.prepare("UPDATE support_tickets SET status='answered',updated_at=?,expires_at=? WHERE id=?").bind(now,Date.now()+90*86400000,t.id)]);return c.json({sent:true})});
 app.delete('/:id',async c=>{const t=await c.env.DB.prepare('SELECT * FROM support_tickets WHERE id=?').bind(c.req.param('id')).first<Ticket>();if(!t)throw new HTTPException(404);await access(c,t.organization_id);await c.env.DB.batch([c.env.DB.prepare("DELETE FROM user_notifications WHERE type='support_ticket' AND entity_id=?").bind(t.id),c.env.DB.prepare('DELETE FROM support_messages WHERE ticket_id=?').bind(t.id),c.env.DB.prepare('DELETE FROM support_tickets WHERE id=?').bind(t.id)]);return c.json({deleted:true})});
 return app;
}
