import { z } from 'zod';
import { authorizeOrganization, type OrganizationActor } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { prepareEventOperation, claimEventOperation, finishEventOperation, eventOperationStatus, previewFingerprint, enforceEventRateLimit } from './eventOperationStore';

function sourceHost(value:string){try{return new URL(value).hostname;}catch{return '';}}
const officialSource = z.string().url().max(2000).refine(value => {
  try { const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      ['bpw.maryland.gov', 'interactive2.marylandtaxes.gov'].includes(url.hostname);
  } catch { return false; }
});
const rowSchema = z.object({
  id: z.string().regex(/^md-(?:bpw|view):[a-f0-9]{64}$/),
  dataset: z.enum(['bpw','mdview']), external_id: z.string().min(1).max(200),
  agency_label: z.string().min(1).max(1000), recipient_label: z.string().min(1).max(5000),
  occurred_at: z.string().date(), amount_cents: z.number().int().safe(),
  fact_type: z.enum(['reported_award','disbursement']), description: z.string().max(30000),
  source_url: officialSource, metadata: z.record(z.string(), z.string().max(30000)),
  retrieved_at: z.string().datetime({offset:true}), source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((row,ctx) => {
  const bpw = row.dataset === 'bpw';
  if (row.fact_type !== (bpw ? 'reported_award' : 'disbursement') || !row.id.startsWith(bpw ? 'md-bpw:' : 'md-view:') ||
      sourceHost(row.source_url) !== (bpw ? 'bpw.maryland.gov' : 'interactive2.marylandtaxes.gov'))
    ctx.addIssue({code:'custom',message:'Dataset, source, ID and financial fact type must match'});
});
export const comptrollerImportSchema = z.object({
  organizationId:z.string().min(1).max(200), rows:z.array(rowSchema).min(1).max(250),
  confirm:z.boolean().optional(), previewId:z.string().uuid().optional(),
}).strict();

export async function importMarylandComptroller(db:D1Database, actor:OrganizationActor, input:unknown) {
  if (!actor.isOperator) throw new EventIntegrationError(403,'Operator access required for Comptroller observations');
  const parsed=comptrollerImportSchema.safeParse(input);
  if (!parsed.success) throw new EventIntegrationError(400,'Invalid Comptroller observations');
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
    const stored={...fields,source_system:'maryland_comptroller',currency:'USD',measurement:'delta',notes:row.dataset==='bpw' ? 'Approval observation; may amend another award or name multiple recipients. Negative amounts indicate revenue. Do not sum with payments.' : 'Reported disbursed payment total; not internal ledger settlement or invoice allocation.',metadata_json:JSON.stringify(Object.fromEntries(Object.entries(metadata).sort(([a],[b])=>a.localeCompare(b))))};
    const previous=previousById.get(row.id) || null;
    if (previous && Object.entries(stored).some(([key,value])=>!['retrieved_at','source_sha256'].includes(key) && previous[key]!==value))
      throw new EventIntegrationError(409,'Existing Comptroller observation changed; review the source correction');
    plan.push({stored,previous});
  }
  const owner={userId:actor.id,organizationId:changes.organizationId,eventId:'organization:comptroller-import'};
  const fingerprint=await previewFingerprint({changes,plan});
  if (!confirm) return {operation:'import_maryland_comptroller',records:changes.rows.length,newRecords:plan.filter(p=>!p.previous).length,
    effect:'Stores public source observations in the master transaction view. No balances, permissions or organization identity links change.',
    changes,...await prepareEventOperation(db,owner,fingerprint)};
  if (!previewId) throw new EventIntegrationError(409,'Request a preview first');
  await claimEventOperation(db,owner,previewId,fingerprint);
  try {
    const sql=plan.filter(p=>!p.previous).map(({stored:r})=>db.prepare(`INSERT INTO external_financial_observations
      (id,source_system,dataset,external_id,agency_label,recipient_label,occurred_at,amount_cents,currency,measurement,fact_type,notes,description,source_url,metadata_json,retrieved_at,source_sha256)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(r.id,r.source_system,r.dataset,r.external_id,r.agency_label,r.recipient_label,r.occurred_at,r.amount_cents,r.currency,r.measurement,r.fact_type,r.notes,r.description,r.source_url,r.metadata_json,r.retrieved_at,r.source_sha256));
    sql.push(db.prepare(`INSERT INTO audit_events(id,actor_user_id,action,resource_type,resource_id,metadata_json,created_at)
      VALUES(?,?,'organization.comptroller_import','organization',?,?,?)`).bind(crypto.randomUUID(),actor.id,changes.organizationId,
      JSON.stringify({ids:changes.rows.map(r=>r.id),sourceHashes:[...new Set(changes.rows.map(r=>r.source_sha256))]}),new Date().toISOString()));
    await db.batch(sql);
    await finishEventOperation(db,previewId,true,['import_maryland_comptroller']);
    return {previewId,recorded:plan.filter(p=>!p.previous).length,existing:plan.filter(p=>p.previous).length};
  } catch(error) { await finishEventOperation(db,previewId,false,[]); throw error; }
}

export async function marylandComptrollerStatus(db:D1Database,actor:OrganizationActor,organizationId:string,previewId?:string){
  if(!actor.isOperator) throw new EventIntegrationError(403,'Operator access required for Comptroller observations');
  await authorizeOrganization(db,actor,'manage',organizationId);
  if(previewId) return eventOperationStatus(db,actor.id,organizationId,previewId);
  const totals=await db.prepare(`SELECT dataset,count(*) AS records,sum(amount_cents) AS amount_cents,
    min(occurred_at) AS period_start,max(occurred_at) AS period_end
    FROM external_financial_observations WHERE source_system='maryland_comptroller' GROUP BY dataset ORDER BY dataset`).all();
  const sources=await db.prepare(`SELECT source_sha256,count(*) AS records FROM external_financial_observations
    WHERE source_system='maryland_comptroller' GROUP BY source_sha256 ORDER BY source_sha256`).all();
  return {sourceSystem:'maryland_comptroller',totals:totals.results || [],sources:sources.results || []};
}
