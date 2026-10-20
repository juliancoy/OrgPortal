import { Hono } from 'hono';
import { z } from 'zod';
import { emailAudit, requireEmailOrganizer } from './emailAccess';
import { emailContentSchema } from './emailContent';
import { emailFail, digest, normalizeEmail, type EmailActor, type EmailCampaign } from './emailShared';
import { campaignEngagement } from './emailEngagement';
import { senderFor } from './emailGoogle';
import { renderCampaign } from './emailTemplate';
import { prepareEventOperation, claimEventOperation, finishEventOperation } from './eventOperationStore';
import { EventIntegrationError } from './eventPlatforms';
const evidence=z.string().max(2000).default('').refine(v=>{if(!v)return true;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password}catch{return false}},'Evidence must use HTTPS');
export const outreachRecipientSchema=z.object({email:z.string().max(254),name:z.string().max(255).default(''),source_url:evidence,source_checked_at:z.string().max(80).default(''),approved:z.boolean().default(false),review_reason:z.string().max(1000).default(''),gmail_message_id:z.string().max(200).default(''),status:z.enum(['sent','bounced','held']).default('held'),error:z.string().max(1000).default(''),notice_id:z.string().max(200).default('')}).strict();
export const outreachSchema=z.object({organizationId:z.string().min(1).max(200),subject:z.string().trim().min(1).max(200).regex(/^[^\r\n\0]+$/),body:z.string().trim().min(1).max(20000),content:emailContentSchema.prefault({}),recipients:z.array(outreachRecipientSchema).min(1).max(500)}).strict();
export const emailHistorySchema=outreachSchema.extend({import_key:z.string().min(1).max(200),sent_at:z.number().int().positive().refine(v=>v<=Date.now()+60000,'Send time cannot be in the future'),previewId:z.string().uuid().optional(),confirm:z.boolean().optional()}).strict();
async function owned(env:Env,actor:EmailActor,id:string){const row=await env.DB.prepare('SELECT * FROM email_campaigns WHERE id=? AND owner_user_id=?').bind(id,actor.id).first<EmailCampaign>();if(!row||(row.expires_at&&row.expires_at<=Date.now()))emailFail(400,'Campaign not found.');await requireEmailOrganizer(env,actor,row.organization_id);return row;}
function normalized(rows:z.infer<typeof outreachRecipientSchema>[]){const seen=new Set<string>(),result:typeof rows=[];let invalid=0,duplicates=0;for(const row of rows){const email=normalizeEmail(row.email);if(!email){invalid++;continue}if(seen.has(email)){duplicates++;continue}seen.add(email);result.push({...row,email})}return {rows:result,invalid,duplicates};}
function approved(row:z.infer<typeof outreachRecipientSchema>){
 if(!row.approved||!row.source_url||!row.source_checked_at||!Number.isFinite(Date.parse(row.source_checked_at)))return false;
 if(Date.parse(row.source_checked_at)>Date.now()+60000||Date.parse(row.source_checked_at)<Date.now()-7*86400000)return false;
 if(/privacy|abuse|legal|patient|adverse|gradapply|admission|recruit|career|billing|security/i.test(row.email.split('@')[0]))return false;
 const source=new URL(row.source_url).hostname.replace(/^www\./,''),domain=row.email.split('@')[1];
 return source===domain||source.endsWith('.'+domain)||domain.endsWith('.'+source)||row.review_reason.trim().length>=20;
}
async function insert(env:Env,user:EmailActor,input:z.infer<typeof outreachSchema>,history?:z.infer<typeof emailHistorySchema>){
 await requireEmailOrganizer(env,user,input.organizationId);
 const sender=await senderFor(env,user.id);if(!sender||(!history&&sender.status!=='connected'))emailFail(409,'Connect your Google sender first.');
 const group=await env.DB.prepare('SELECT name,slug FROM organizations WHERE id=?').bind(input.organizationId).first<{name:string;slug:string}>();if(!group)emailFail(400,'Group not found.');
 const {rows,invalid,duplicates}=normalized(input.recipients);if(!rows.length)emailFail(400,'No valid email addresses were found.');
 const now=Date.now(),id=crypto.randomUUID(),campaign:EmailCampaign={id,owner_user_id:user.id,sender_email:sender.email,organization_id:input.organizationId,event_id:'',event_json:JSON.stringify({id:'',slug:group.slug,title:input.content.heading||group.name,organization_name:group.name,starts_at:null,location:null,image_url:null,host_org_id:input.organizationId}),audience:'organization',subject:input.subject,body:input.body,status:history?'completed':'draft',scheduled_at:history?.sent_at||now,created_at:history?.sent_at||now,audience_mode:'outreach',batch_size:50,batch_limit:50,content_json:JSON.stringify(input.content),report_only:history?1:0};
 renderCampaign(env,campaign,'Alex',null);
 const deliveries=rows.map(row=>({...row,id:crypto.randomUUID(),review_status:history?(row.status==='held'?'held':'approved'):approved(row)?'approved':'held',status:history?(row.status==='held'?'skipped':'sent'):'draft'}));
 const statements=[env.DB.prepare(`INSERT INTO email_campaigns(id,owner_user_id,sender_email,organization_id,event_id,event_json,audience,subject,body,status,scheduled_at,created_at,audience_mode,batch_size,batch_limit,content_json,report_only,import_key,expires_at)
 VALUES(?,?,?,?,?,?,'organization',?,?,?,?,?,'outreach',50,50,?,?,?,?)`).bind(id,user.id,sender.email,input.organizationId,'',campaign.event_json,input.subject,input.body,campaign.status,campaign.scheduled_at,campaign.created_at,campaign.content_json,history?1:0,history?.import_key||null,now+90*86400000),
 env.DB.prepare(`INSERT INTO email_deliveries(id,campaign_id,sender_user_id,email,name,kind,status,source_url,source_checked_at,review_status,gmail_message_id,sent_at,bounced_at,bounce_notice_id,error,dns_status)
 SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.email'),json_extract(value,'$.name'),'campaign',json_extract(value,'$.status'),json_extract(value,'$.source_url'),json_extract(value,'$.source_checked_at'),json_extract(value,'$.review_status'),NULLIF(json_extract(value,'$.gmail_message_id'),''),CASE WHEN json_extract(value,'$.status')='sent' THEN ? ELSE NULL END,CASE WHEN json_extract(value,'$.notice_id')!='' AND json_extract(value,'$.status')='sent' THEN ? ELSE NULL END,NULLIF(json_extract(value,'$.notice_id'),''),NULLIF(json_extract(value,'$.error'),''),? FROM json_each(?)`).bind(id,user.id,history?.sent_at||null,history?.sent_at||null,history?'imported':'pending',JSON.stringify(deliveries)),emailAudit(env,user.id,input.organizationId,history?'campaign.history-imported':'campaign.outreach-created',id,deliveries.length)];
 if(history)statements.push(env.DB.prepare(`INSERT INTO email_bounces(organization_id,email,reason,source_message_id,first_seen_at,updated_at) SELECT ?,json_extract(value,'$.email'),json_extract(value,'$.error'),json_extract(value,'$.notice_id'),?,? FROM json_each(?) WHERE json_extract(value,'$.notice_id')!='' ON CONFLICT(organization_id,email) DO UPDATE SET reason=excluded.reason,source_message_id=excluded.source_message_id,updated_at=excluded.updated_at`).bind(input.organizationId,now,now,JSON.stringify(deliveries)));
 await env.DB.batch(statements);return {id,recipients:rows.length,invalid,duplicates,report_only:Boolean(history)};
}
export async function importEmailHistory(env:Env,identity:{userId:string;scopes:string[]},input:unknown){
 if(!identity.scopes.includes('org:portal.read')||!identity.scopes.includes('org:portal.write'))throw new EventIntegrationError(403,'Missing portal scope');
 const args=emailHistorySchema.parse(input);if(args.recipients.some(r=>r.status!=='held'&&!r.gmail_message_id||r.status==='bounced'&&!r.notice_id||r.status!=='bounced'&&r.notice_id))emailFail(400,'Accepted recipients need Gmail receipts; bounced recipients also need a failure notice.');const actor={id:identity.userId};await requireEmailOrganizer(env,actor,args.organizationId);
 const existing=await env.DB.prepare('SELECT id FROM email_campaigns WHERE owner_user_id=? AND organization_id=? AND import_key=?').bind(actor.id,args.organizationId,args.import_key).first<{id:string}>();if(existing)return {id:existing.id,already_imported:true};
 const {confirm,previewId,...content}=args;const fingerprint=await digest(JSON.stringify(content));const owner={userId:actor.id,organizationId:args.organizationId,eventId:'email:history'};
 if(!confirm)return {organizationId:args.organizationId,subject:args.subject,recipients:normalized(args.recipients).rows.length,accepted:args.recipients.filter(x=>x.status!=='held').length,known_bounced:args.recipients.filter(x=>x.status==='bounced').length,report_only:true,...await prepareEventOperation(env.DB,owner,fingerprint)};
 if(!previewId)emailFail(409,'Preview this history import first.');await claimEventOperation(env.DB,owner,previewId,fingerprint);
 try{const result=await insert(env,actor,args,args);await finishEventOperation(env.DB,previewId,true,['history']);return result}catch(e){await finishEventOperation(env.DB,previewId,false,[]);throw e}
}
export function emailOutreachRoutes(getUser:(env:Env,request:Request)=>Promise<EmailActor>){
 const routes=new Hono<{Bindings:Env}>();
 routes.onError((error,c)=>{if(error instanceof z.ZodError)return c.json({detail:error.issues.map(i=>i.message).join('; ')},400);if('getResponse' in error && typeof error.getResponse==='function')return error.getResponse();throw error;});
 routes.post('/',async c=>{const user=await getUser(c.env,c.req.raw);const args=outreachSchema.parse(await c.req.json());return c.json(await insert(c.env,user,args),201)});
 routes.post('/:id/check',async c=>{
  const user=await getUser(c.env,c.req.raw),campaign=await owned(c.env,user,c.req.param('id'));if(campaign.report_only||campaign.status!=='draft')emailFail(409,'Check recipients while this outreach campaign is a draft.');
  const rows=await c.env.DB.prepare("SELECT id,email FROM email_deliveries WHERE campaign_id=? AND kind='campaign' AND dns_status IN ('pending','unconfirmed') ORDER BY CASE dns_status WHEN 'pending' THEN 0 ELSE 1 END LIMIT 12").bind(campaign.id).all<{id:string;email:string}>();
  for(const row of rows.results||[]){let status='unconfirmed';try{const domain=row.email.split('@')[1],url=new URL('https://cloudflare-dns.com/dns-query');url.search=new URLSearchParams({name:domain,type:'MX'}).toString();const r=await fetch(url,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(3000)});if(r.ok){const d=await r.json() as {Status:number;Answer?:{type:number;data:string}[]};const mx=(d.Answer||[]).filter(x=>x.type===15);status=d.Status===3?'nxdomain':mx.some(x=>x.data!=='0 .'&&x.data!=='0')?'mx_present':mx.length?'null_mx':'no_mx'}}catch{/* A DNS failure is never approval. */}await c.env.DB.prepare('UPDATE email_deliveries SET dns_status=? WHERE id=? AND campaign_id=?').bind(status,row.id,campaign.id).run();}
  const pending=await c.env.DB.prepare("SELECT count(*) n FROM email_deliveries WHERE campaign_id=? AND dns_status='pending'").bind(campaign.id).first<{n:number}>();return c.json({checked:rows.results?.length||0,remaining:Number(pending?.n||0)});
 });
 routes.post('/:id/review',async c=>{
  const user=await getUser(c.env,c.req.raw),campaign=await owned(c.env,user,c.req.param('id'));if(campaign.report_only||campaign.status!=='draft')emailFail(409,'Review recipients before queueing a campaign.');
  const args=z.object({deliveryId:z.string().max(200),approved:z.boolean(),reason:z.string().trim().min(20).max(1000)}).strict().parse(await c.req.json());
  await c.env.DB.batch([c.env.DB.prepare("UPDATE email_deliveries SET review_status=?,error=?,source_checked_at=? WHERE id=? AND campaign_id=? AND kind='campaign' AND source_url!='' AND source_checked_at!=''").bind(args.approved?'approved':'held',args.reason,new Date().toISOString(),args.deliveryId,campaign.id),c.env.DB.prepare("UPDATE email_deliveries SET status='skipped',error='Audience review changed; send a new self-test.' WHERE campaign_id=? AND kind='test' AND status='sent'").bind(campaign.id),emailAudit(c.env,user.id,campaign.organization_id,'campaign.recipient-reviewed',campaign.id,1)]);return c.json({reviewed:true});
 });
 routes.post('/:id/reconcile',async c=>{const user=await getUser(c.env,c.req.raw),campaign=await owned(c.env,user,c.req.param('id'));const a=z.object({deliveryId:z.string().max(200),status:z.enum(['sent','failed']),gmail_message_id:z.string().max(200).default(''),evidence:z.string().min(20).max(1000)}).strict().parse(await c.req.json());if(a.status==='sent'&&!a.gmail_message_id)emailFail(400,'Record the confirmed Gmail message ID.');await c.env.DB.batch([c.env.DB.prepare("UPDATE email_deliveries SET status=?,gmail_message_id=?,error=?,sent_at=CASE WHEN ?='sent' THEN ? ELSE sent_at END WHERE id=? AND campaign_id=? AND status='uncertain'").bind(a.status,a.gmail_message_id||null,a.evidence,a.status,Date.now(),a.deliveryId,campaign.id),emailAudit(c.env,user.id,campaign.organization_id,'campaign.uncertain-reconciled',campaign.id,1)]);return c.json({recorded:true,retried:false})});
 routes.delete('/:id',async c=>{const user=await getUser(c.env,c.req.raw),campaign=await owned(c.env,user,c.req.param('id'));if(campaign.status==='queued')emailFail(409,'Pause this campaign before deleting it.');await c.env.DB.prepare('DELETE FROM email_campaigns WHERE id=? AND owner_user_id=?').bind(campaign.id,user.id).run();return c.json({deleted:true})});
 routes.post('/history',async c=>{const user=await getUser(c.env,c.req.raw);return c.json(await importEmailHistory(c.env,{userId:user.id,scopes:['org:portal.read','org:portal.write']},await c.req.json()))});
 return routes;
}

export const emailReportSchema=z.object({organizationId:z.string().min(1).max(200),campaignId:z.string().min(1).max(200)}).strict();
export async function readEmailReport(env:Env,identity:{userId:string;scopes:string[]},input:unknown){
 if(!identity.scopes.includes('org:portal.read'))throw new EventIntegrationError(403,'Missing portal scope');
 const args=emailReportSchema.parse(input),campaign=await owned(env,{id:identity.userId},args.campaignId);
 if(campaign.organization_id!==args.organizationId)emailFail(400,'Campaign not found.');
 const counts=await env.DB.prepare(`SELECT count(*) total,sum(status='sent') accepted,sum(bounced_at IS NOT NULL AND status='sent') bounced,sum(status='failed') failed,sum(status='uncertain') uncertain,sum(status='skipped' OR (review_status='held' AND status IN ('draft','queued'))) skipped,sum(status IN ('draft','queued','sending') AND review_status='approved') pending FROM email_deliveries WHERE campaign_id=? AND kind='campaign'`).bind(campaign.id).first();
 return {id:campaign.id,subject:campaign.subject,status:campaign.status,report_only:Boolean(campaign.report_only),delivery_stats:counts,engagement:await campaignEngagement(env,campaign.id),analytics_url:`https://orgportal.cc/email?organization_id=${encodeURIComponent(args.organizationId)}&campaign_id=${encodeURIComponent(campaign.id)}`};
}
