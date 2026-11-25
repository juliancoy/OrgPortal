import {createHash} from 'node:crypto';
import {federalPublicProjection} from './federalStorage';
import {z} from 'zod';
import {authorizeOrganization,type OrganizationActor} from './organizationIam';
import {EventIntegrationError} from './eventPlatforms';
import {canonicalJson,previewFingerprint,prepareEventOperation,claimEventOperation,finishEventOperation,enforceEventRateLimit,eventOperationStatus} from './eventOperationStore';
export const collections=['organizations','relationships','financing','events','nonprofitProfiles','performanceRecords','performanceAssessments','metadata','positions'] as const;
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const ecosystemRowCheck=z.object({collection:z.enum(collections),key:digest,sha256:digest}).strict();
const row=ecosystemRowCheck.extend({value:z.record(z.string(),z.unknown())}).strict();
export const ecosystemImportSchema=z.object({organizationId:z.string().min(1).max(200),datasetId:digest,
 action:z.enum(['stage','publish','delete_archived']),rows:z.array(row).max(200).default([]),previewId:z.string().uuid().optional(),confirm:z.boolean().optional()}).strict();
export async function ecosystemDatasetStatus(db:D1Database,actor:OrganizationActor,organizationId:string,datasetId:string,previewId?:string,verifyRows?:{collection:string;key:string;sha256:string}[]){
 if(!actor.isOperator)throw new EventIntegrationError(403,'Operator access required');
 await authorizeOrganization(db,actor,'manage',organizationId);
 if(verifyRows&&!previewId)throw new EventIntegrationError(400,'Row reconciliation requires an owned preview receipt');
 if(previewId){
  const receipt=await eventOperationStatus(db,actor.id,organizationId,previewId);
  if(!verifyRows)return receipt;
  if(!verifyRows.length||verifyRows.length>200||new Set(verifyRows.map(row=>row.collection+':'+row.key)).size!==verifyRows.length)throw new EventIntegrationError(400,'Invalid stage reconciliation keys');
  const stored=await db.prepare(`SELECT r.collection,r.record_key,r.sha256 FROM json_each(?) AS wanted
   CROSS JOIN ecosystem_public_records AS r ON r.dataset_id=?
   AND r.collection=json_extract(wanted.value,'$[0]') AND r.record_key=json_extract(wanted.value,'$[1]')`)
   .bind(JSON.stringify(verifyRows.map(row=>[row.collection,row.key])),datasetId).all<{collection:string;record_key:string;sha256:string}>();
  const found=new Map(stored.results.map(row=>[row.collection+':'+row.record_key,row.sha256]));
  const conflicting=verifyRows.filter(row=>found.has(row.collection+':'+row.key)&&found.get(row.collection+':'+row.key)!==row.sha256).length;
  return {...receipt,rowVerification:{datasetId,requested:verifyRows.length,matched:stored.results.length-conflicting,missing:verifyRows.length-stored.results.length,conflicting}};
 }
 const dataset=await db.prepare('SELECT * FROM ecosystem_public_datasets WHERE id=?').bind(datasetId).first();
 // Hash in primary-key order with bounded pages. Materializing the full graph
 // and its joined checksum string exhausted Worker memory on historical imports.
 const hash=createHash('sha256');const counts=new Map<string,number>();
 let collection='',key='';
 while(true){
  const page=await db.prepare(`SELECT collection,record_key,sha256 FROM ecosystem_public_records
   WHERE dataset_id=? AND (collection,record_key)>(?,?) ORDER BY collection,record_key LIMIT 2000`)
   .bind(datasetId,collection,key).all<{collection:string;record_key:string;sha256:string}>();
  for(const row of page.results){
   hash.update(`${row.collection}\t${row.record_key}\t${row.sha256}\n`);
   counts.set(row.collection,(counts.get(row.collection)??0)+1);
  }
  if(page.results.length<2000)break;
  const last=page.results.at(-1)!;collection=last.collection;key=last.record_key;
 }
 return {dataset,counts:[...counts].map(([collection,records])=>({collection,records})),digest:hash.digest('hex')};
}
export async function importEcosystemDataset(db:D1Database,actor:OrganizationActor,input:unknown){
 if(!actor.isOperator)throw new EventIntegrationError(403,'Operator access required');
 const parsed=ecosystemImportSchema.safeParse(input);if(!parsed.success)throw new EventIntegrationError(400,'Invalid public ecosystem records');
 const {confirm,previewId,...changes}=parsed.data;
 await authorizeOrganization(db,actor,'manage',changes.organizationId);await enforceEventRateLimit(db,actor.id);
 if(changes.action==='stage'&&!changes.rows.length)throw new EventIntegrationError(400,'Stage requires records');
 if(changes.action!=='stage'&&changes.rows.length)throw new EventIntegrationError(400,'Publish cannot change records');
 const keys=new Set<string>();
 for(const r of changes.rows){
  const key=`${r.collection}:${r.key}`;if(keys.has(key))throw new EventIntegrationError(400,'Duplicate source key');keys.add(key);
  if(new TextEncoder().encode(canonicalJson(r.value)).byteLength>60000||await previewFingerprint(r.value)!==r.sha256)throw new EventIntegrationError(400,'Source record checksum or size mismatch');
  if(['organizations','relationships','events'].includes(r.collection)&&typeof r.value.id!=='string')throw new EventIntegrationError(400,'Source ID required');
 }
 const current=await db.prepare('SELECT state FROM ecosystem_public_datasets WHERE id=?').bind(changes.datasetId).first<{state:string}>();
 if(changes.action==='delete_archived'&&current?.state!=='archived')throw new EventIntegrationError(409,'Only superseded archived datasets can be deleted; publish a reviewed correction first');
 if(changes.action!=='delete_archived'&&current&&current.state!=='staging')throw new EventIntegrationError(409,'Published datasets are immutable; use a new reviewed version');
 const previous=await db.prepare(`SELECT r.collection,r.record_key,r.sha256 FROM json_each(?) AS wanted
 CROSS JOIN ecosystem_public_records AS r ON r.dataset_id=?
 AND r.collection=json_extract(wanted.value,'$[0]') AND r.record_key=json_extract(wanted.value,'$[1]')`).bind(JSON.stringify(changes.rows.map(r=>[r.collection,r.key])),changes.datasetId).all<{collection:string;record_key:string;sha256:string}>();
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
  }else if(changes.action==='delete_archived'){
   statements.push(db.prepare("DELETE FROM ecosystem_public_datasets WHERE id=? AND state='archived'").bind(changes.datasetId));
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

export async function publicEcosystemNativeRecords(db:D1Database,after='',limit=500,shards:D1Database[]=[]){
 // Larger pages amortize network round trips; keep the legacy default and a
 // bounded response/query size for public callers.
 if(!Number.isInteger(limit)||limit<1||limit>2000)throw new EventIntegrationError(400,'Native page limit must be an integer from 1 to 2000');
 // Keep the master view's public projection, but bound the large external
 // branch by indexed IDs before projecting/sorting it. Sorting the entire
 // remaining view on every page made bulk exports quadratic in source rows.
 const columns=`id,record_id,record_type,occurred_at,transaction_type,amount,currency,amount_label,
 quantity,unit,description,from_label,to_label,from_organization_id,to_organization_id,status,source_url,evidence,notes,provenance_json,
 financial_fact_type,financial_measurement,period_start,period_end,award_id,award_identifier`;
 // Both branches retain explicit public record types. Private ledger/account
 // columns and records never enter the export, even if IDs overlap.
 const rows=await db.prepare(`SELECT * FROM (
 SELECT ${columns} FROM master_transaction_records_before_external_observations
 WHERE record_type IN ('organization_support','company_financing','nonprofit_grant') AND id>?
 ORDER BY id LIMIT ?)
 UNION ALL SELECT ${columns} FROM master_transaction_records_before_ecosystem
 WHERE record_type='external_financial_observation' AND id IN (
 SELECT id FROM external_financial_observations WHERE id>? ORDER BY id LIMIT ?)
 ORDER BY id LIMIT ?`).bind(after,limit+1,after,limit+1,limit+1).all<Record<string,unknown>>();
 const extra=await Promise.all(shards.map(store=>store.prepare(`SELECT ${federalPublicProjection} FROM external_financial_observations WHERE source_system='usaspending' AND id>? ORDER BY id LIMIT ?`).bind(after,limit+1).all<Record<string,unknown>>()));
 const combined=[...rows.results,...extra.flatMap(part=>part.results)].sort((a,b)=>String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);
 if(combined.some((row,i)=>i>0&&row.id===combined[i-1].id))throw new EventIntegrationError(503,'Duplicate federal records across storage; review before export');
 const page=combined.slice(0,limit);
 return {records:page,next:combined.length>limit?page.at(-1)!.id:null};
}
