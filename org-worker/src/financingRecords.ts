import { z } from 'zod';
import { authorizeOrganization, type OrganizationActor } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { prepareEventOperation, claimEventOperation, finishEventOperation, previewFingerprint, enforceEventRateLimit } from './eventOperationStore';
const url=z.string().url().max(2000).refine(s=>{const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;});
const key=z.string().regex(/^[a-z0-9-]{1,180}$/);
export const financingEventSchema=z.object({id:key,companyKey:key,announcedAt:z.string().min(4).max(40),label:z.string().min(1).max(200),type:z.enum(['agency','equity','debt','grant','acquisition','cumulative']),amountUsd:z.number().positive().finite(),amountQualifier:z.enum(['exact','over','up-to']),investors:z.array(z.string().max(200)).max(50),sourceUrls:z.array(url).min(1).max(20),notes:z.string().max(5000),tags:z.array(z.string().trim().min(1).max(160)).max(30).transform(tags=>[...new Set(tags)]).default([]),includedInEventId:key.nullable().default(null)}).strict();
const auditSchema=z.object({candidateSources:z.array(z.object({title:z.string().max(1000),url})).max(100).default([])}).passthrough();
const recipientSchema=z.object({key,name:z.string().min(1).max(300),organizationId:z.string().max(200).nullable(),metadata:z.record(z.string(),z.unknown()),research:z.record(z.string(),z.unknown()),audit:auditSchema}).strict();
export const financingImportSchema=z.object({organizationId:z.string().min(1).max(200),reviewedAt:z.string().min(4).max(40),recipients:z.array(recipientSchema).min(1).max(25),events:z.array(financingEventSchema).max(250),confirm:z.boolean().optional(),previewId:z.string().uuid().optional()}).strict();
async function agency(db:D1Database,id:string){const org=await db.prepare('SELECT id,name,slug FROM organizations WHERE id=? OR slug=?').bind(id,id).first<{id:string;name:string;slug:string}>();if(!org)throw new EventIntegrationError(404,'Funding organization not found');return org;}
export async function importFinancing(db:D1Database,actor:OrganizationActor,input:unknown){
 if(!actor.isOperator)throw new EventIntegrationError(403,'Operator access required for public financing evidence');
 const parsed=financingImportSchema.safeParse(input);if(!parsed.success)throw new EventIntegrationError(400,parsed.error.issues.map(i=>i.message).join('; '));
 const {confirm,previewId,...changes}=parsed.data,org=await agency(db,changes.organizationId);
 await authorizeOrganization(db,actor,'manage',org.id);await enforceEventRateLimit(db,actor.id);
 const keys=new Set(changes.recipients.map(r=>r.key));if(keys.size!==changes.recipients.length||new Set(changes.events.map(e=>e.id)).size!==changes.events.length||changes.events.some(e=>!keys.has(e.companyKey)))throw new EventIntegrationError(400,'Duplicate identities or event outside recipient batch');
 const previous=[];
 for(const r of changes.recipients){
  if(r.organizationId&&!await db.prepare('SELECT id FROM organizations WHERE id=?').bind(r.organizationId).first())throw new EventIntegrationError(409,`Recipient organization needs a live identity match: ${r.name}`);
  previous.push(await db.prepare('SELECT * FROM financing_recipients WHERE id=?').bind(r.key).first());
 }
 for(const e of changes.events){const old=await db.prepare('SELECT * FROM financing_events WHERE id=?').bind(e.id).first<{recipient_id:string;agency_id:string|null}>();if(old&&(old.recipient_id!==e.companyKey||old.agency_id!==(e.type==='agency'?org.id:null)))throw new EventIntegrationError(409,'Event id belongs to another recipient or agency');previous.push(old);}
 for(const e of changes.events) if(e.includedInEventId){
  const inBatch=changes.events.find(parent=>parent.id===e.includedInEventId);
  const stored=inBatch?null:await db.prepare('SELECT * FROM financing_events WHERE id=?').bind(e.includedInEventId).first<{recipient_id:string;event_type:string;amount:number}>();
  if(e.type!=='agency'||(inBatch?.companyKey||stored?.recipient_id)!==e.companyKey||(inBatch?.type||stored?.event_type)!=='equity'||e.amountUsd>(inBatch?.amountUsd||stored?.amount||0))throw new EventIntegrationError(400,'A contribution must link to an equity round for the same recipient and cannot exceed the round amount');
  if(stored) previous.push(stored);
 }
 const preview={changes,organization:org,previous,effect:'Atomically stores public financing evidence and audit coverage; regenerates agency and recipient views from database records. No payments or permissions change.'};
 const owner={userId:actor.id,organizationId:org.id,eventId:'organization:financing-import'},fingerprint=await previewFingerprint(preview);
 if(!confirm)return {...preview,...await prepareEventOperation(db,owner,fingerprint)};
 if(!previewId)throw new EventIntegrationError(409,'Request a preview first');await claimEventOperation(db,owner,previewId,fingerprint);
 const now=new Date().toISOString(),sql:D1PreparedStatement[]=[];
 try{
  for(const r of changes.recipients){
   sql.push(db.prepare('INSERT INTO financing_recipients(id,name,organization_id,metadata_json,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,organization_id=excluded.organization_id,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at').bind(r.key,r.name,r.organizationId,JSON.stringify(r.metadata),now));
   sql.push(db.prepare('INSERT INTO financing_agency_recipients(id,agency_id,recipient_id,research_json,audit_json,reviewed_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(agency_id,recipient_id) DO UPDATE SET research_json=excluded.research_json,audit_json=excluded.audit_json,reviewed_at=excluded.reviewed_at,updated_at=excluded.updated_at').bind(`${org.id}:${r.key}`,org.id,r.key,JSON.stringify(r.research),JSON.stringify(r.audit),changes.reviewedAt,now));
  }
  for(const e of changes.events)sql.push(db.prepare(`INSERT INTO financing_events(id,recipient_id,agency_id,event_type,amount,currency,amount_qualifier,occurred_at,label,investors_json,sources_json,notes,included_in_event_id,updated_at,tags_json) VALUES(?,?,?,?,?,'USD',?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET amount=excluded.amount,currency=excluded.currency,amount_qualifier=excluded.amount_qualifier,occurred_at=excluded.occurred_at,label=excluded.label,investors_json=excluded.investors_json,sources_json=excluded.sources_json,notes=excluded.notes,included_in_event_id=excluded.included_in_event_id,updated_at=excluded.updated_at,tags_json=excluded.tags_json`).bind(e.id,e.companyKey,e.type==='agency'?org.id:null,e.type,e.amountUsd,e.amountQualifier,e.announcedAt,e.label,JSON.stringify(e.investors),JSON.stringify(e.sourceUrls),e.notes,e.includedInEventId,now,JSON.stringify(e.tags)));
  sql.push(db.prepare("INSERT INTO audit_events(id,actor_user_id,action,resource_type,resource_id,metadata_json,created_at) VALUES(?,?,'organization.financing_import','organization',?,?,?)").bind(crypto.randomUUID(),actor.id,org.id,JSON.stringify(changes),now));
  await db.batch(sql);await finishEventOperation(db,previewId,true,['financing_import']);return {previewId,storedRecipients:changes.recipients.length,storedEvents:changes.events.length};
 }catch(error){await finishEventOperation(db,previewId,false,[]);throw error;}
}
function eventRow(row:any){return {agencyId:row.agency_id,id:row.id,companyKey:row.recipient_id,announcedAt:row.occurred_at,label:row.label,type:row.event_type,amountUsd:row.amount,amountQualifier:row.amount_qualifier,investors:JSON.parse(row.investors_json),sourceUrls:JSON.parse(row.sources_json),notes:row.notes,includedInEventId:row.included_in_event_id,tags:JSON.parse(row.tags_json)};}
export async function financingAgencyReport(db:D1Database,id:string){
 const org=await agency(db,id);
 const result=await db.batch([db.prepare('SELECT r.*,a.research_json,a.audit_json,a.reviewed_at FROM financing_agency_recipients a JOIN financing_recipients r ON r.id=a.recipient_id WHERE a.agency_id=? ORDER BY r.id').bind(org.id),db.prepare('SELECT e.* FROM financing_events e WHERE e.recipient_id IN (SELECT recipient_id FROM financing_agency_recipients WHERE agency_id=?) ORDER BY e.id').bind(org.id)]);
 const rows=result[0].results||[],events=(result[1].results||[]).map(eventRow);
 const companies=rows.map((r:any)=>{const metadata=JSON.parse(r.metadata_json),facts=events.filter(e=>e.type==='agency'&&e.companyKey===r.id).filter(e=>e.agencyId===org.id);return {...metadata,key:r.id,name:r.name,organizationId:r.organization_id,totalUsd:facts.length?facts.reduce((n,e)=>n+e.amountUsd,0):null,rank:null,fundingEvidence:facts.map(e=>({amountUsd:e.amountUsd,sourceUrl:e.sourceUrls[0],asOf:e.announcedAt,kind:e.label,evidence:e.notes,tags:e.tags}))};});
 const methodology='Database-derived reported agency contributions and distinct company financing events. Equity rounds exclude agency contributions, debt, grants, acquisition prices and cumulative disclosures. Histories are partial; unknown does not mean zero.';
 return {organization:org,generatedAt:new Date().toISOString(),manifest:{organizationId:org.id,reviewedAt:rows.reduce((s:string,r:any)=>r.reviewed_at>s?r.reviewed_at:s,''),coverage:'Public source-backed research; financial histories remain incomplete.',recipients:rows.map((r:any)=>JSON.parse(r.research_json))},funding:{methodology,companies},financing:{methodology,events:events.filter(e=>e.type!=='agency'),audit:rows.map((r:any)=>{const audit=JSON.parse(r.audit_json);return {...audit,candidateSources:(audit.candidateSources || []).map((lead:{title:string;url:string})=>{const transactionIds=events.filter(event=>event.companyKey===r.id&&event.type!=='agency'&&event.sourceUrls.includes(lead.url)).map(event=>event.id);return {...lead,outcome:transactionIds.length?'verified':'pending',transactionIds};})};}).sort((a,b)=>a.priority-b.priority||a.name.localeCompare(b.name))}};
}
export async function financingRecipientReport(db:D1Database,id:string){
 const rows=await db.prepare('SELECT * FROM financing_recipients WHERE id=? OR organization_id=? OR organization_id=(SELECT id FROM organizations WHERE slug=?)').bind(id,id,id).all();
 if(!rows.results?.length)throw new EventIntegrationError(404,'Recipient financing not found');
 const events=await db.prepare('SELECT * FROM financing_events WHERE recipient_id IN (SELECT id FROM financing_recipients WHERE id=? OR organization_id=? OR organization_id=(SELECT id FROM organizations WHERE slug=?)) ORDER BY occurred_at DESC,id').bind(id,id,id).all();
 return {generatedAt:new Date().toISOString(),recipients:rows.results.map((r:any)=>({key:r.id,name:r.name,...JSON.parse(r.metadata_json)})),events:(events.results||[]).map(eventRow)};
}
