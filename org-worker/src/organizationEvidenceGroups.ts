import {z} from 'zod';
import {defaultEvidenceGroups,evidenceGroupSource,type EvidenceGrouping} from '../../shared/organizationEvidenceGroups';
import {authorizeOrganization,type OrganizationActor} from './organizationIam';
import {EventIntegrationError} from './eventPlatforms';
import {prepareEventOperation,claimEventOperation,finishEventOperation,previewFingerprint,enforceEventRateLimit} from './eventOperationStore';
type Organization={id:string;slug:string;name:string};
const schema=z.object({action:z.enum(['add','remove']),member:z.object({id:z.string().min(1).max(300),name:z.string().min(1).max(500)}).strict()}).strict();
export const evidenceGroupOperationSchema=schema.extend({organizationId:z.string().min(1).max(200),confirm:z.boolean().optional(),previewId:z.string().uuid().optional()}).strict();
/** MCP edits use the same authorization and exact-source validation as the UI. */
export async function runEvidenceGroupOperation(db:D1Database,actor:OrganizationActor,input:unknown){
 const parsed=evidenceGroupOperationSchema.safeParse(input);if(!parsed.success)throw new EventIntegrationError(400,'Invalid grouping change');
 const {organizationId,confirm,previewId,...change}=parsed.data;
 const org=await organization(db,organizationId);if(!org)throw new EventIntegrationError(404,'Organization not found');
 await authorizeOrganization(db,actor,'manage',org.id);
 await enforceEventRateLimit(db,actor.id);
 const before=await organizationEvidenceGrouping(db,org.id);
 if(change.member.id===org.id)throw new EventIntegrationError(400,'The organization is the fixed center of its grouping');
 if(change.action==='add'&&await publicMember(db,change.member))throw new EventIntegrationError(400,'Choose a source node; directory organizations keep their own groupings');
 const preview={organizationId:org.id,change,before,effect:'Changes shared display grouping only; original records, legal identities, balances and memberships remain unchanged.'};
 const owner={userId:actor.id,organizationId:org.id,eventId:'organization:evidence-group'},fingerprint=await previewFingerprint(preview);
 if(!confirm)return {...preview,...await prepareEventOperation(db,owner,fingerprint)};
 if(!previewId)throw new EventIntegrationError(409,'Request a preview first and supply its previewId');
 await claimEventOperation(db,owner,previewId,fingerprint);
 try{const group=await changeOrganizationEvidenceGrouping(db,actor,org.id,change);await finishEventOperation(db,previewId,true,['organization.evidence_group']);return {previewId,group};}
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
async function publicMember(db:D1Database,member:{id:string;name:string}){
 const native=await organization(db,member.id);if(native)return native;
 const exported=await db.prepare(`SELECT r.payload_json FROM ecosystem_public_records r JOIN ecosystem_public_datasets d ON d.id=r.dataset_id
  WHERE d.state='active' AND r.collection='organizations' AND json_extract(r.payload_json,'$.id')=? LIMIT 1`).bind(member.id).first();
 if(exported){const node=JSON.parse(String(exported.payload_json));return typeof node.portalSlug==='string'?await organization(db,node.portalSlug):null;}
 const label=/^source-label:([^:]+):(agency|recipient):([a-f0-9]{32})$/.exec(member.id);
 if(!label)throw new EventIntegrationError(400,'Choose an existing public source node');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(member.name)))].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);
 if(hash!==label[3])throw new EventIntegrationError(400,'The source label does not match its ID');
 const field=label[2]==='agency'?'from_label':'to_label',identity=label[2]==='agency'?'from_organization_id':'to_organization_id';
 const found=await db.prepare(`SELECT 1 AS found FROM master_transaction_records_before_ecosystem WHERE ${field}=? AND ${identity} IS NULL
  AND record_type IN ('organization_support','company_financing','nonprofit_grant','external_financial_observation')
  AND (CASE WHEN record_type='external_financial_observation' THEN COALESCE(NULLIF(evidence,''),record_type) ELSE record_type END)=? LIMIT 1`).bind(member.name,label[1]).first();
 if(!found)throw new EventIntegrationError(400,'The source node is not in the public transaction records');
 return null;
}
export async function changeOrganizationEvidenceGrouping(db:D1Database,actor:OrganizationActor,handle:string,input:unknown){
 const parsed=schema.safeParse(input);if(!parsed.success)throw new EventIntegrationError(400,'Invalid grouping change');
 const org=await organization(db,handle);if(!org)throw new EventIntegrationError(404,'Organization not found');
 await authorizeOrganization(db,actor,'manage',org.id);
 const {action,member}=parsed.data;
 if(member.id===org.id)throw new EventIntegrationError(400,'The organization is the fixed center of its grouping');
 const current=await organizationEvidenceGrouping(db,org.id);
 if(action==='add'){
  if(current!.members.length>=50&&!current!.members.includes(member.id))throw new EventIntegrationError(400,'A grouping can contain up to 50 source nodes');
  // Directory organizations retain their own independent management and grouping.
  const native=await publicMember(db,member);
  if(native)throw new EventIntegrationError(400,'Choose a source node; directory organizations keep their own groupings');
  const owner=await db.prepare('SELECT organization_id FROM organization_source_identities WHERE source=? AND external_id=?').bind(evidenceGroupSource,member.id).first<{organization_id:string}>();
  if(owner&&owner.organization_id!==org.id)throw new EventIntegrationError(409,'This source node already belongs to another grouping');
  for(const [id,members] of Object.entries(defaultEvidenceGroups))if(id!==org.id&&members.includes(member.id)&&!(await stored(db,id)).length)throw new EventIntegrationError(409,'Remove this source node from its current grouping first');
 }
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
 if(action==='add')statements.push(db.prepare(`INSERT INTO organization_source_identities(source,external_id,organization_id)
  VALUES(?,?,CASE WHEN (SELECT count(*) FROM organization_source_identities WHERE source=? AND organization_id=? AND external_id!=?)<50
   OR EXISTS(SELECT 1 FROM organization_source_identities WHERE source=? AND external_id=? AND organization_id=?) THEN ? ELSE NULL END)
  ON CONFLICT(source,external_id) DO UPDATE SET organization_id=CASE WHEN organization_id=excluded.organization_id THEN organization_id ELSE NULL END`).bind(evidenceGroupSource,member.id,evidenceGroupSource,org.id,org.id,evidenceGroupSource,member.id,org.id,org.id));
 else statements.push(db.prepare('DELETE FROM organization_source_identities WHERE source=? AND external_id=? AND organization_id=?').bind(evidenceGroupSource,member.id,org.id));
 statements.push(db.prepare(`INSERT INTO audit_events(id,actor_user_id,action,resource_type,resource_id,metadata_json,created_at) VALUES(?,?,'organization.evidence_group','organization',?,?,?)`)
  .bind(crypto.randomUUID(),actor.id,org.id,JSON.stringify({action,memberId:member.id}),now));
 try{await db.batch(statements);}catch{throw new EventIntegrationError(409,'Grouping or permissions changed. Reload and try again');}
 return organizationEvidenceGrouping(db,org.id);
}
