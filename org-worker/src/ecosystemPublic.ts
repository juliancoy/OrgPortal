import {z} from 'zod';
import {authorizeOrganization,type OrganizationActor} from './organizationIam';
import {EventIntegrationError} from './eventPlatforms';
import {canonicalJson,previewFingerprint,prepareEventOperation,claimEventOperation,finishEventOperation,enforceEventRateLimit,eventOperationStatus} from './eventOperationStore';
export const collections=['organizations','relationships','financing','events','nonprofitProfiles','performanceRecords','performanceAssessments','metadata','positions'] as const;
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const row=z.object({collection:z.enum(collections),key:digest,value:z.record(z.string(),z.unknown()),sha256:digest}).strict();
export const ecosystemImportSchema=z.object({organizationId:z.string().min(1).max(200),datasetId:digest,
 action:z.enum(['stage','publish']),rows:z.array(row).max(200).default([]),previewId:z.string().uuid().optional(),confirm:z.boolean().optional()}).strict();
export async function ecosystemDatasetStatus(db:D1Database,actor:OrganizationActor,organizationId:string,datasetId:string,previewId?:string){
 if(!actor.isOperator)throw new EventIntegrationError(403,'Operator access required');
 await authorizeOrganization(db,actor,'manage',organizationId);
 if(previewId)return eventOperationStatus(db,actor.id,organizationId,previewId);
 const dataset=await db.prepare('SELECT * FROM ecosystem_public_datasets WHERE id=?').bind(datasetId).first();
 const counts=await db.prepare('SELECT collection,count(*) AS records FROM ecosystem_public_records WHERE dataset_id=? GROUP BY collection ORDER BY collection').bind(datasetId).all();
 const hashes=await db.prepare('SELECT collection,record_key,sha256 FROM ecosystem_public_records WHERE dataset_id=? ORDER BY collection,record_key').bind(datasetId).all<{collection:string;record_key:string;sha256:string}>();
 return {dataset,counts:counts.results,digest:await hashRows(hashes.results)};
}
async function hashRows(rows:{collection:string;record_key:string;sha256:string}[]){
 const bytes=new TextEncoder().encode(rows.map(r=>`${r.collection}\t${r.record_key}\t${r.sha256}\n`).join(''));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function importEcosystemDataset(db:D1Database,actor:OrganizationActor,input:unknown){
 if(!actor.isOperator)throw new EventIntegrationError(403,'Operator access required');
 const parsed=ecosystemImportSchema.safeParse(input);if(!parsed.success)throw new EventIntegrationError(400,'Invalid public ecosystem records');
 const {confirm,previewId,...changes}=parsed.data;
 await authorizeOrganization(db,actor,'manage',changes.organizationId);await enforceEventRateLimit(db,actor.id);
 if(changes.action==='stage'&&!changes.rows.length)throw new EventIntegrationError(400,'Stage requires records');
 if(changes.action==='publish'&&changes.rows.length)throw new EventIntegrationError(400,'Publish cannot change records');
 const keys=new Set<string>();
 for(const r of changes.rows){
  const key=`${r.collection}:${r.key}`;if(keys.has(key))throw new EventIntegrationError(400,'Duplicate source key');keys.add(key);
  if(new TextEncoder().encode(canonicalJson(r.value)).byteLength>60000||await previewFingerprint(r.value)!==r.sha256)throw new EventIntegrationError(400,'Source record checksum or size mismatch');
  if(['organizations','relationships','events'].includes(r.collection)&&typeof r.value.id!=='string')throw new EventIntegrationError(400,'Source ID required');
 }
 const current=await db.prepare('SELECT state FROM ecosystem_public_datasets WHERE id=?').bind(changes.datasetId).first<{state:string}>();
 if(current&&current.state!=='staging')throw new EventIntegrationError(409,'Published datasets are immutable; use a new reviewed version');
 const previous=await db.prepare(`SELECT collection,record_key,sha256 FROM ecosystem_public_records WHERE dataset_id=?
 AND (collection || ':' || record_key) IN (SELECT value FROM json_each(?))`).bind(changes.datasetId,JSON.stringify([...keys])).all<{collection:string;record_key:string;sha256:string}>();
 const prior=new Map(previous.results.map(r=>[r.collection+':'+r.record_key,r.sha256]));
 for(const r of changes.rows)if(prior.has(r.collection+':'+r.key)&&prior.get(r.collection+':'+r.key)!==r.sha256)throw new EventIntegrationError(409,'Source key changed within dataset');
 let publishedCount=0;
 if(changes.action==='publish'){
  const status=await ecosystemDatasetStatus(db,actor,changes.organizationId,changes.datasetId);
  if(!('digest' in status)||!current||status.digest!==changes.datasetId)throw new EventIntegrationError(409,'Dataset is incomplete or checksum differs');
  publishedCount=status.counts.reduce((n,r)=>n+Number(r.records),0);
  for(const name of ['organizations','relationships','metadata'])if(!status.counts.some(r=>r.collection===name))throw new EventIntegrationError(409,'Required graph collections missing');
 }
 const owner={userId:actor.id,organizationId:changes.organizationId,eventId:'organization:ecosystem-dataset'};
 const fingerprint=await previewFingerprint(changes);
 if(!confirm)return {operation:'import_ecosystem_dataset',action:changes.action,records:changes.rows.length,
  effect:'Stores only reviewed public graph evidence. No organization memberships, identities or ledger balances change.',...await prepareEventOperation(db,owner,fingerprint)};
 if(!previewId)throw new EventIntegrationError(409,'Request a preview first');await claimEventOperation(db,owner,previewId,fingerprint);
 try{
  const now=new Date().toISOString();const statements:D1PreparedStatement[]=[];
  if(changes.action==='stage'){
   statements.push(db.prepare("INSERT OR IGNORE INTO ecosystem_public_datasets(id,state,created_at) VALUES(?,'staging',?)").bind(changes.datasetId,now));
   for(const r of changes.rows)if(!prior.has(r.collection+':'+r.key))statements.push(db.prepare('INSERT INTO ecosystem_public_records(dataset_id,collection,record_key,payload_json,sha256) VALUES(?,?,?,?,?)').bind(changes.datasetId,r.collection,r.key,canonicalJson(r.value),r.sha256));
  }else{
   statements.push(db.prepare("UPDATE ecosystem_public_datasets SET state='archived' WHERE state='active'"));
   statements.push(db.prepare("UPDATE ecosystem_public_datasets SET state=CASE WHEN (SELECT count(*) FROM ecosystem_public_records WHERE dataset_id=?)=? THEN 'active' ELSE 'invalid' END,activated_at=? WHERE id=? AND state='staging'").bind(changes.datasetId,publishedCount,now,changes.datasetId));
  }
  statements.push(db.prepare("INSERT INTO audit_events(id,actor_user_id,action,resource_type,resource_id,metadata_json,created_at) VALUES(?,?,'organization.ecosystem_dataset','organization',?,?,?)").bind(crypto.randomUUID(),actor.id,changes.organizationId,JSON.stringify({datasetId:changes.datasetId,action:changes.action,count:changes.rows.length}),now));
  await db.batch(statements);await finishEventOperation(db,previewId,true,['import_ecosystem_dataset']);
  return {previewId,action:changes.action,recorded:changes.rows.length-prior.size,existing:prior.size,datasetId:changes.datasetId};
 }catch(error){await finishEventOperation(db,previewId,false,[]);throw error;}
}
/** Explicit public allowlist; private ledgers, accounts, memberships and profiles never enter this export. */
export async function publicEcosystemRecords(db:D1Database,collection:string,after='',datasetId?:string){
 if(!(collections as readonly string[]).includes(collection))throw new EventIntegrationError(400,'Unknown public collection');
 const active=await db.prepare("SELECT id,activated_at FROM ecosystem_public_datasets WHERE state='active'").first<{id:string;activated_at:string}>();
 if(!active)throw new EventIntegrationError(503,'Unified public dataset has not been published');
 if(datasetId&&active.id!==datasetId)throw new EventIntegrationError(409,'Public dataset changed; restart export');
 const rows=await db.prepare('SELECT record_key,payload_json,sha256 FROM ecosystem_public_records WHERE dataset_id=? AND collection=? AND record_key>? ORDER BY record_key LIMIT 201')
 .bind(active.id,collection,after).all<{record_key:string;payload_json:string;sha256:string}>();
 const page=rows.results.slice(0,200);
 return {datasetId:active.id,activatedAt:active.activated_at,records:page.map(r=>({key:r.record_key,value:JSON.parse(r.payload_json),sha256:r.sha256})),next:rows.results.length>200?page.at(-1)!.record_key:null};
}

export async function publicEcosystemNativeRecords(db:D1Database,after=''){
 // Source type allowlist is mandatory: no private account IDs/ledger entries.
 const rows=await db.prepare(`SELECT id,record_id,record_type,occurred_at,transaction_type,amount,currency,amount_label,
 quantity,unit,description,from_label,to_label,from_organization_id,to_organization_id,status,source_url,evidence,notes,provenance_json,
 financial_fact_type,financial_measurement,period_start,period_end,award_id,award_identifier
 FROM master_transaction_records_before_ecosystem
 WHERE record_type IN ('organization_support','company_financing','nonprofit_grant','external_financial_observation') AND id>?
 ORDER BY id LIMIT 501`).bind(after).all<Record<string,unknown>>();
 const page=rows.results.slice(0,500);
 return {records:page,next:rows.results.length>500?page.at(-1)!.id:null};
}
