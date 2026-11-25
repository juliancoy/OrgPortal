import { z } from 'zod';
import { authorizeOrganization, type OrganizationActor } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { prepareEventOperation, claimEventOperation, finishEventOperation, eventOperationStatus, previewFingerprint, enforceEventRateLimit } from './eventOperationStore';

const code=z.string().max(20);
const text=z.string().max(1000);
const metadata=z.object({
 transaction_key:text,award_key:text,award_identifier:text,fiscal_year:z.string().regex(/^20\d{2}$/),
 awarding_agency_code:code,awarding_agency_name:text.optional(),awarding_sub_agency_code:code,awarding_sub_agency_name:text,
 funding_agency_code:code,funding_agency_name:text,recipient_uei:z.string().max(12),
 recipient_state_code:code,recipient_country_code:code,
 primary_place_of_performance_state_code:code,primary_place_of_performance_country_code:code,
 primary_place_of_performance_state_name:text.optional(),
 modification_number:text,assistance_type:code,award_type:code,
}).strict();
const rowSchema=z.object({
 id:z.string().regex(/^usaspending:transaction:[a-f0-9]{64}$/),dataset:z.literal('prime_transactions'),
 external_id:z.string().min(1).max(1000),agency_label:z.string().min(1).max(1000),recipient_label:z.string().min(1).max(5000),
 occurred_at:z.string().date(),amount_cents:z.number().int().safe(),fact_type:z.literal('obligation'),
 description:z.string().max(30000),source_url:z.string().url().max(2000),metadata,
 retrieved_at:z.string().datetime({offset:true}),source_sha256:z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((row,ctx)=>{
 let official=false;
 try{const url=new URL(row.source_url);official=url.protocol==='https:'&&!url.username&&!url.password&&url.hostname==='www.usaspending.gov'&&decodeURIComponent(url.pathname).replace(/\/$/,'')==='/award/'+row.metadata.award_key;}catch{}
 const fy=Number(row.occurred_at.slice(0,4))+(Number(row.occurred_at.slice(5,7))>=10?1:0);
 const maryland=(row.metadata.recipient_state_code==='MD'&&row.metadata.recipient_country_code==='USA')||
  (row.metadata.primary_place_of_performance_state_code==='MD'&&row.metadata.primary_place_of_performance_country_code==='USA');
 if(!official||!maryland||row.metadata.transaction_key!==row.external_id||String(fy)!==row.metadata.fiscal_year)
  ctx.addIssue({code:'custom',message:'Official award link, transaction key, federal year and Maryland geography must match'});
});
export const usaspendingImportSchema = z.object({
  organizationId:z.string().min(1).max(200), rows:z.array(rowSchema).min(1).max(1000),
  confirm:z.boolean().optional(), previewId:z.string().uuid().optional(),
}).strict();

export async function importUsaspending(db:D1Database, actor:OrganizationActor, input:unknown) {
  if (!actor.isOperator) throw new EventIntegrationError(403,'Operator access required for USAspending observations');
  const parsed=usaspendingImportSchema.safeParse(input);
  if (!parsed.success) throw new EventIntegrationError(400,'Invalid USAspending observations');
  const {confirm,previewId,...changes}=parsed.data;
  await authorizeOrganization(db,actor,'manage',changes.organizationId);
  await enforceEventRateLimit(db,actor.id);
  if (new Set(changes.rows.map(row=>row.id)).size !== changes.rows.length)
    throw new EventIntegrationError(400,'Duplicate observation identifiers');
  const existing=await db.prepare('SELECT * FROM external_financial_observations WHERE id IN (SELECT value FROM json_each(?))')
    .bind(JSON.stringify(changes.rows.map(row=>row.id))).all<Record<string,unknown>>();
  const previousById=new Map((existing.results || []).map(row=>[row.id,row]));
  const plan=[];
  for (const row of changes.rows) {
    const {metadata,...fields}=row;
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(row.external_id));
    const expected='usaspending:transaction:'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    if(row.id!==expected)throw new EventIntegrationError(400,'Federal transaction identity does not match its source key');
    const stored={...fields,source_system:'usaspending',currency:'USD',measurement:'delta',
      notes:'Federal action obligation or deobligation; not a disbursement, loan face value or internal ledger settlement. Prime transaction; overlapping Maryland location searches are deduplicated by source transaction key.',
      metadata_json:JSON.stringify(Object.fromEntries(Object.entries(metadata).sort(([a],[b])=>a.localeCompare(b))))};
    const previous=previousById.get(row.id) || null;
    if (previous && Object.entries(stored).some(([key,value])=>!['retrieved_at','source_sha256'].includes(key) && previous[key]!==value))
      throw new EventIntegrationError(409,'Existing USAspending observation changed; review the source correction');
    plan.push({stored,previous});
  }
  const owner={userId:actor.id,organizationId:changes.organizationId,eventId:'organization:usaspending-import'};
  const fingerprint=await previewFingerprint({changes,plan});
  if (!confirm) {
    const totals=new Map<string,{records:number;amount_cents:number}>();
    for(const row of changes.rows){
      const value=totals.get(row.metadata.fiscal_year)||{records:0,amount_cents:0};
      value.records++;value.amount_cents+=row.amount_cents;
      if(!Number.isSafeInteger(value.amount_cents))throw new EventIntegrationError(400,'Batch obligation total exceeds safe integer range');
      totals.set(row.metadata.fiscal_year,value);
    }
    return {operation:'import_usaspending',records:changes.rows.length,newRecords:plan.filter(p=>!p.previous).length,
    effect:'Stores public source observations in the master transaction view. No balances, permissions or organization identity links change.',
    review:{organizationId:changes.organizationId,firstId:changes.rows[0].id,lastId:changes.rows.at(-1)!.id,
      sourceHashes:[...new Set(changes.rows.map(row=>row.source_sha256))].sort(),
      totals:[...totals].sort(([a],[b])=>a.localeCompare(b)).map(([fiscal_year,total])=>({fiscal_year,...total}))},
    ...await prepareEventOperation(db,owner,fingerprint)};
  }
  if (!previewId) throw new EventIntegrationError(409,'Request a preview first');
  await claimEventOperation(db,owner,previewId,fingerprint);
  try {
    const sql=plan.filter(p=>!p.previous).map(({stored:r})=>db.prepare(`INSERT INTO external_financial_observations
      (id,source_system,dataset,external_id,agency_label,recipient_label,occurred_at,amount_cents,currency,measurement,fact_type,notes,description,source_url,metadata_json,retrieved_at,source_sha256)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(r.id,r.source_system,r.dataset,r.external_id,r.agency_label,r.recipient_label,r.occurred_at,r.amount_cents,r.currency,r.measurement,r.fact_type,r.notes,r.description,r.source_url,r.metadata_json,r.retrieved_at,r.source_sha256));
    sql.push(db.prepare(`INSERT INTO audit_events(id,actor_user_id,action,resource_type,resource_id,metadata_json,created_at)
      VALUES(?,?,'organization.usaspending_import','organization',?,?,?)`).bind(crypto.randomUUID(),actor.id,changes.organizationId,
      JSON.stringify({ids:changes.rows.map(r=>r.id),sourceHashes:[...new Set(changes.rows.map(r=>r.source_sha256))]}),new Date().toISOString()));
    await db.batch(sql);
    await finishEventOperation(db,previewId,true,['import_usaspending']);
    return {previewId,recorded:plan.filter(p=>!p.previous).length,existing:plan.filter(p=>p.previous).length};
  } catch(error) { await finishEventOperation(db,previewId,false,[]); throw error; }
}

export async function usaspendingStatus(db:D1Database,actor:OrganizationActor,organizationId:string,previewId?:string){
  if(!actor.isOperator) throw new EventIntegrationError(403,'Operator access required for USAspending observations');
  await authorizeOrganization(db,actor,'manage',organizationId);
  if(previewId) return eventOperationStatus(db,actor.id,organizationId,previewId);
  // Import validation requires fiscal_year to match occurred_at. Group the small
  // date column: sorting metadata_json for every row exhausts D1 memory at scale.
  const totals=await db.prepare(`SELECT dataset,CAST(CAST(substr(occurred_at,1,4) AS INTEGER)+(substr(occurred_at,6,2)>='10') AS TEXT) AS fiscal_year,count(*) AS records,sum(amount_cents) AS amount_cents,
    min(occurred_at) AS period_start,max(occurred_at) AS period_end
    FROM external_financial_observations WHERE source_system='usaspending' GROUP BY dataset,CAST(CAST(substr(occurred_at,1,4) AS INTEGER)+(substr(occurred_at,6,2)>='10') AS TEXT) ORDER BY dataset,fiscal_year`).all();
  const sources=await db.prepare(`SELECT source_sha256,count(*) AS records FROM external_financial_observations
    WHERE source_system='usaspending' GROUP BY source_sha256 ORDER BY source_sha256`).all();
  return {sourceSystem:'usaspending',totals:totals.results || [],sources:sources.results || []};
}
