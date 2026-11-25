import {z} from 'zod';
import {defaultEvidenceGroups,evidenceGroupSource,evidenceGroupExclusionSource,type EvidenceGrouping} from '../../shared/organizationEvidenceGroups';
import {matchOrganizationNames,matchOrganizationEins,organizationMatchCandidate,type OrganizationMatch} from '../../shared/organizationMatching';
import {authorizeOrganization,type OrganizationActor} from './organizationIam';
import {EventIntegrationError} from './eventPlatforms';
import {prepareEventOperation,claimEventOperation,finishEventOperation,previewFingerprint,enforceEventRateLimit} from './eventOperationStore';
type Organization={id:string;slug:string;name:string};
const schema=z.object({action:z.enum(['add','remove']),member:z.object({id:z.string().min(1).max(300),name:z.string().min(1).max(500)}).strict(),mode:z.enum(['manual','automatic']).default('manual'),reason:z.string().trim().max(1000).optional()}).strict();
export const evidenceGroupOperationSchema=schema.extend({organizationId:z.string().min(1).max(200),confirm:z.boolean().optional(),previewId:z.string().uuid().optional()}).strict();
/** MCP edits use the same authorization and exact-source validation as the UI. */
export async function runEvidenceGroupOperation(db:D1Database,actor:OrganizationActor,input:unknown,shards:D1Database[]=[]){
 const parsed=evidenceGroupOperationSchema.safeParse(input);if(!parsed.success)throw new EventIntegrationError(400,'Invalid grouping change');
 const {organizationId,confirm,previewId,...change}=parsed.data;
 const org=await organization(db,organizationId);if(!org)throw new EventIntegrationError(404,'Organization not found');
 await authorizeOrganization(db,actor,'manage',org.id);
 await enforceEventRateLimit(db,actor.id);
 const before=await organizationEvidenceGrouping(db,org.id);
 if(change.member.id===org.id)throw new EventIntegrationError(400,'The organization is the fixed center of its grouping');
 if(change.action==='add'&&await publicMember(db,change.member,shards))throw new EventIntegrationError(400,'Choose a source node; directory organizations keep their own groupings');
 const match=change.mode==='automatic'?await automaticMatch(db,org,change):null;
 const preview={organizationId:org.id,change,before,match,effect:'Records a shared source association; original records, legal identities, balances and memberships remain unchanged.'};
 const owner={userId:actor.id,organizationId:org.id,eventId:'organization:evidence-group'},fingerprint=await previewFingerprint(preview);
 if(!confirm)return {...preview,...await prepareEventOperation(db,owner,fingerprint)};
 if(!previewId)throw new EventIntegrationError(409,'Request a preview first and supply its previewId');
 await claimEventOperation(db,owner,previewId,fingerprint);
 try{const group=await changeOrganizationEvidenceGrouping(db,actor,org.id,change,shards);await finishEventOperation(db,previewId,true,['organization.evidence_group']);return {previewId,group};}
 catch(error){await finishEventOperation(db,previewId,false,[]);throw error;}
}
async function organization(db:D1Database,handle:string){return db.prepare('SELECT id,slug,name FROM organizations WHERE id=? OR slug=?').bind(handle,handle).first<Organization>();}
async function stored(db:D1Database,id:string){return (await db.prepare('SELECT external_id FROM organization_source_identities WHERE source=? AND organization_id=? ORDER BY external_id').bind(evidenceGroupSource,id).all<{external_id:string}>()).results.map(r=>r.external_id);}
export async function organizationEvidenceGrouping(db:D1Database,handle:string):Promise<EvidenceGrouping|null>{
 let org=await organization(db,handle);
 if(!org){
  const mapped=await db.prepare('SELECT organization_id FROM organization_source_identities WHERE source=? AND external_id=?').bind(evidenceGroupSource,handle).first<{organization_id:string}>();
  if(mapped)org=await organization(db,mapped.organization_id);
  if(!org)for(const [id,members] of Object.entries(defaultEvidenceGroups))if(members.includes(handle)&&!(await stored(db,id)).length){org=await organization(db,id);break;}
 }
 if(!org)return null;
 const ids=await stored(db,org.id),members=ids.length?ids.filter(id=>id!==org.id):defaultEvidenceGroups[org.id]||[];
 return {organizationId:org.id,slug:org.slug,name:org.name,members};
}
/** Validate an exact public source reference; names are never fuzzy identity joins. */
async function publicMember(db:D1Database,member:{id:string;name:string},shards:D1Database[]=[]){
 const native=await organization(db,member.id);if(native)return native;
 const exported=await db.prepare(`SELECT r.payload_json FROM ecosystem_public_records r JOIN ecosystem_public_datasets d ON d.id=r.dataset_id
  WHERE d.state='active' AND r.collection='organizations' AND json_extract(r.payload_json,'$.id')=? LIMIT 1`).bind(member.id).first();
 if(exported){const node=JSON.parse(String(exported.payload_json));if(node.name!==member.name)throw new EventIntegrationError(409,'Source name changed. Reload the matching evidence');return typeof node.portalSlug==='string'?await organization(db,node.portalSlug):null;}
 if(await federalMemberEvidence(db,member,shards))return null;
 const label=/^source-label:([^:]+):(agency|recipient):([a-f0-9]{32})$/.exec(member.id);
 if(!label)throw new EventIntegrationError(400,'Choose an existing public source node');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(member.name)))].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);
 if(hash!==label[3])throw new EventIntegrationError(400,'The source label does not match its ID');
 const field=label[2]==='agency'?'from_label':'to_label',identity=label[2]==='agency'?'from_organization_id':'to_organization_id';
 let found=await db.prepare(`SELECT 1 AS found FROM master_transaction_records_before_ecosystem WHERE ${field}=? AND ${identity} IS NULL
  AND record_type IN ('organization_support','company_financing','nonprofit_grant','external_financial_observation')
  AND (CASE WHEN record_type='external_financial_observation' THEN COALESCE(NULLIF(evidence,''),record_type) ELSE record_type END)=? LIMIT 1`).bind(member.name,label[1]).first();
 if(!found&&label[1]==='usaspending'){
  for(const store of shards){found=await store.prepare(`SELECT 1 AS found FROM external_financial_observations WHERE source_system='usaspending' AND ${label[2]==='agency'?'agency_label':'recipient_label'}=? LIMIT 1`).bind(member.name).first();if(found)break;}
 }
 if(!found)throw new EventIntegrationError(400,'The source node is not in the public transaction records');
 return null;
}
/** The graph also derives exact USAspending IDs from live master observations. */
async function federalMemberEvidence(db:D1Database,member:{id:string;name:string},shards:D1Database[]=[]){
 const recipient=/^usgov:recipient:([A-Z0-9]{12})$/.exec(member.id),agency=/^usgov:agency:(\d{3})$/.exec(member.id);
 if(!recipient&&!agency||agency?.[1]==='999')return null;
 const field=recipient?'recipient_uei':'awarding_agency_code',label=recipient?'recipient_label':'agency_label';
 // Reject unrelated labels before parsing metadata, and stop at the first
 // exact observation. Sorting this source-wide scan defeats LIMIT 1.
 for(const store of [db,...shards]){const found=await store.prepare(`SELECT id,source_sha256,source_url FROM external_financial_observations
  WHERE source_system='usaspending' AND ${label}=? AND json_extract(metadata_json,'$.${field}')=? LIMIT 1`)
  .bind(member.name,(recipient||agency)![1]).first<{id:string;source_sha256:string;source_url:string}>();if(found)return found;}
 return null;
}
const exclusionKey=(org:string,member:string)=>JSON.stringify([org,member]);
async function recordedEins(db:D1Database,ids:string[]){
 const eins=ids.flatMap(id=>/^nonprofit:(\d{9})$/.exec(id)?.slice(1)||[]);
 if(ids.length){
  const rows=await db.prepare(`SELECT r.payload_json FROM ecosystem_public_records r JOIN ecosystem_public_datasets d ON d.id=r.dataset_id
   WHERE d.state='active' AND r.collection='organizations' AND json_extract(r.payload_json,'$.id') IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<{payload_json:string}>();
  for(const row of rows.results){const ein=JSON.parse(row.payload_json)?.identifiers?.ein;if(typeof ein==='string')eins.push(ein);}
 }
 return eins;
}
async function automaticMatch(db:D1Database,org:Organization,change:z.infer<typeof schema>):Promise<OrganizationMatch>{
 if(change.action!=='add')throw new EventIntegrationError(400,'Automatic matching only adds associations');
 if(await db.prepare('SELECT 1 AS found FROM organization_source_identities WHERE source=? AND external_id=?').bind(evidenceGroupExclusionSource,exclusionKey(org.id,change.member.id)).first())throw new EventIntegrationError(409,'A human removed this association; automatic matching cannot restore it');
 const group=await organizationEvidenceGrouping(db,org.id);
 const [organizationEins,sourceEins]=await Promise.all([recordedEins(db,[org.id,...group!.members]),recordedEins(db,[change.member.id])]);
 const match=matchOrganizationEins(matchOrganizationNames(org.name,change.member.name),organizationEins,sourceEins);
 if(!match.automatic)throw new EventIntegrationError(409,'Match requires review: '+[...match.reasons,...match.conflicts].join('; '));
 const alternatives=await db.prepare('SELECT id,name FROM organizations WHERE id!=? ORDER BY id').bind(org.id).all<{id:string;name:string}>();
 for(const other of alternatives.results){
  if(!organizationMatchCandidate(change.member.name,other.name))continue;
  const alternative=matchOrganizationNames(other.name,change.member.name);
  if(!alternative.conflicts.length&&alternative.score>=match.score-3)throw new EventIntegrationError(409,'Ambiguous match: another organization has an equally strong name');
 }
 return match;
}
/** Public provenance excludes editor account IDs and unrelated audit payloads. */
export async function evidenceGroupingHistory(db:D1Database,handle:string,offset=0){
 const org=await organization(db,handle);if(!org)throw new EventIntegrationError(404,'Organization not found');
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new EventIntegrationError(400,'Invalid history offset');
 const rows=await db.prepare("SELECT id,metadata_json,created_at FROM audit_events WHERE action='organization.evidence_group' AND resource_type='organization' AND resource_id=? ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?").bind(org.id,offset).all<{id:string;metadata_json:string;created_at:string}>();
 const records=rows.results.slice(0,50).map(row=>{const m=JSON.parse(row.metadata_json);return {id:row.id,at:row.created_at,action:m.action,memberId:m.memberId,memberName:m.memberName||null,organizationName:m.organizationName||null,method:m.method||'manual',reason:m.reason||null,match:m.match||null,source:m.source||null};});
 return {records,nextOffset:rows.results.length>50?offset+50:null};
}
export async function changeOrganizationEvidenceGrouping(db:D1Database,actor:OrganizationActor,handle:string,input:unknown,shards:D1Database[]=[]){
 const parsed=schema.safeParse(input);if(!parsed.success)throw new EventIntegrationError(400,'Invalid grouping change');
 const org=await organization(db,handle);if(!org)throw new EventIntegrationError(404,'Organization not found');
 await authorizeOrganization(db,actor,'manage',org.id);
 const {action,member,mode,reason}=parsed.data;
 if(member.id===org.id)throw new EventIntegrationError(400,'The organization is the fixed center of its grouping');
 const current=await organizationEvidenceGrouping(db,org.id);
 const match=mode==='automatic'?await automaticMatch(db,org,parsed.data):null;
 if(action==='add'){
  if(current!.members.length>=50&&!current!.members.includes(member.id))throw new EventIntegrationError(400,'A grouping can contain up to 50 source nodes');
  // Directory organizations retain their own independent management and grouping.
  const native=await publicMember(db,member,shards);
  if(native)throw new EventIntegrationError(400,'Choose a source node; directory organizations keep their own groupings');
  const owner=await db.prepare('SELECT organization_id FROM organization_source_identities WHERE source=? AND external_id=?').bind(evidenceGroupSource,member.id).first<{organization_id:string}>();
  if(owner&&owner.organization_id!==org.id)throw new EventIntegrationError(409,'This source node already belongs to another grouping');
  for(const [id,members] of Object.entries(defaultEvidenceGroups))if(id!==org.id&&members.includes(member.id)&&!(await stored(db,id)).length)throw new EventIntegrationError(409,'Remove this source node from its current grouping first');
 }
 if(mode==='automatic'&&current!.members.includes(member.id))return current;
 const source=action==='add'?await db.prepare(`SELECT r.dataset_id,r.sha256 FROM ecosystem_public_records r JOIN ecosystem_public_datasets d ON d.id=r.dataset_id WHERE d.state='active' AND r.collection='organizations' AND json_extract(r.payload_json,'$.id')=? LIMIT 1`).bind(member.id).first<{dataset_id:string;sha256:string}>():null;
 const federalSource=action==='add'&&!source?await federalMemberEvidence(db,member,shards):null;
 const now=new Date().toISOString(),statements:D1PreparedStatement[]=[];
 // Check initialization inside the batch: concurrent first edits cannot re-add
 // defaults that another editor just removed.
 for(const id of defaultEvidenceGroups[org.id]||[])statements.push(db.prepare(`INSERT OR IGNORE INTO organization_source_identities(source,external_id,organization_id)
  SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM organization_source_identities WHERE source=? AND external_id=?)`).bind(evidenceGroupSource,id,org.id,evidenceGroupSource,org.id));
 // This anchor persists even when the last member is removed. It prevents defaults
 // from reappearing and checks live management permission in the write transaction.
 statements.push(db.prepare(`INSERT INTO organization_source_identities(source,external_id,organization_id)
  VALUES(CASE WHEN ? OR EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=? AND user_id=? AND status='active' AND role IN ('owner','administrator')) THEN ? ELSE NULL END,?,?)
  ON CONFLICT(source,external_id) DO UPDATE SET organization_id=CASE WHEN organization_id=excluded.organization_id THEN organization_id ELSE NULL END`)
  .bind(Number(actor.isOperator),org.id,actor.id,evidenceGroupSource,org.id,org.id));
 if(mode==='automatic')statements.push(db.prepare(`INSERT INTO organization_source_identities(source,external_id,organization_id)
  VALUES(?,?,CASE WHEN NOT EXISTS(SELECT 1 FROM organization_source_identities WHERE source=? AND external_id=?) THEN ? ELSE NULL END)
  ON CONFLICT(source,external_id) DO UPDATE SET organization_id=excluded.organization_id`).bind(evidenceGroupSource,org.id,evidenceGroupExclusionSource,exclusionKey(org.id,member.id),org.id));
 if(action==='remove')statements.push(db.prepare('INSERT OR IGNORE INTO organization_source_identities(source,external_id,organization_id) VALUES(?,?,?)').bind(evidenceGroupExclusionSource,exclusionKey(org.id,member.id),org.id));
 else if(mode==='manual')statements.push(db.prepare('DELETE FROM organization_source_identities WHERE source=? AND external_id=? AND organization_id=?').bind(evidenceGroupExclusionSource,exclusionKey(org.id,member.id),org.id));
 if(action==='add')statements.push(db.prepare(`INSERT INTO organization_source_identities(source,external_id,organization_id)
  VALUES(?,?,CASE WHEN (SELECT count(*) FROM organization_source_identities WHERE source=? AND organization_id=? AND external_id!=?)<50
   OR EXISTS(SELECT 1 FROM organization_source_identities WHERE source=? AND external_id=? AND organization_id=?) THEN ? ELSE NULL END)
  ON CONFLICT(source,external_id) DO UPDATE SET organization_id=CASE WHEN organization_id=excluded.organization_id THEN organization_id ELSE NULL END`).bind(evidenceGroupSource,member.id,evidenceGroupSource,org.id,org.id,evidenceGroupSource,member.id,org.id,org.id));
 else statements.push(db.prepare('DELETE FROM organization_source_identities WHERE source=? AND external_id=? AND organization_id=?').bind(evidenceGroupSource,member.id,org.id));
 statements.push(db.prepare(`INSERT INTO audit_events(id,actor_user_id,action,resource_type,resource_id,metadata_json,created_at) VALUES(?,?,'organization.evidence_group','organization',?,?,?)`)
  .bind(crypto.randomUUID(),actor.id,org.id,JSON.stringify({action,memberId:member.id,memberName:member.name,organizationName:org.name,method:mode,reason:reason||(mode==='automatic'?'Matched by versioned association policy':action==='remove'?'Removed by an authorized editor; automatic reassociation blocked':'Added by an authorized editor'),match,source:source?{datasetId:source.dataset_id,sha256:source.sha256}:federalSource?{kind:'master USAspending observation',id:federalSource.id,sha256:federalSource.source_sha256,url:federalSource.source_url}:{kind:'exact master-record source label',id:member.id},beforeMembers:current!.members}),now));
 try{await db.batch(statements);}catch{throw new EventIntegrationError(409,'Grouping or permissions changed. Reload and try again');}
 return organizationEvidenceGrouping(db,org.id);
}
