import { z } from 'zod';
import { EventIntegrationError } from './eventPlatforms';
import { authorizeOrganization, type OrganizationActor } from './organizationIam';
import { enforceEventRateLimit, prepareEventOperation, previewFingerprint, claimEventOperation, finishEventOperation } from './eventOperationStore';
const url=z.string().url().max(2000).refine(v=>{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;});
const schema=z.object({
 sourceUrl:url,
 changes:z.object({description:z.string().trim().min(1).max(20000).optional(),ends_at:z.string().datetime({offset:true}).optional(),location:z.string().trim().min(1).max(5000).optional(),image_url:url.optional(),host_org_id:z.string().min(1).max(200).optional()}).strict().refine(v=>Object.keys(v).length>0),
 confirm:z.boolean().optional(),previewId:z.string().uuid().optional(),
}).strict();
export async function runEventEnrichmentOperation(db:D1Database,actor:OrganizationActor,eventId:string,input:unknown){
 const parsed=schema.safeParse(input);if(!parsed.success)throw new EventIntegrationError(400,'Invalid event enrichment');
 const {confirm,previewId,...request}=parsed.data;
 const before=await db.prepare('SELECT id,description,starts_at,ends_at,location,image_url,host_org_id,host_org_name,updated_at FROM events WHERE id=?').bind(eventId).first<Record<string,unknown>>();
 if(!before)throw new EventIntegrationError(404,'Event not found');
 if(before.host_org_id)await authorizeOrganization(db,actor,'manage',String(before.host_org_id));
 else if(!actor.isOperator)throw new EventIntegrationError(403,'Operator access required for unclaimed event enrichment');
 const changes:Record<string,unknown>={...request.changes};
 if(changes.ends_at&&(!before.starts_at||Date.parse(String(changes.ends_at))<=Date.parse(String(before.starts_at))))throw new EventIntegrationError(400,'End time must follow start');
 if(changes.host_org_id){
  await authorizeOrganization(db,actor,'manage',String(changes.host_org_id));
  const org=await db.prepare('SELECT name FROM organizations WHERE id=?').bind(changes.host_org_id).first<{name:string}>();
  changes.host_org_name=org!.name;
 }
 await enforceEventRateLimit(db,actor.id);
 const preview={operation:'enrich',eventId,before,changes,sourceUrl:request.sourceUrl,effect:'Updates public event metadata; does not contact providers or notify attendees.'};
 const fingerprint=await previewFingerprint(preview);const owner={userId:actor.id,organizationId:'event:enrichment',eventId};
 if(!confirm)return {...preview,...await prepareEventOperation(db,owner,fingerprint)};
 if(!previewId)throw new EventIntegrationError(409,'Request a preview first');
 await claimEventOperation(db,owner,previewId,fingerprint);
 const now=new Date().toISOString();
 try{
  const fields=Object.keys(changes);
  await db.batch([
   db.prepare(`UPDATE events SET ${fields.map(k=>`${k}=?`).join(',')},updated_at=? WHERE id=?`).bind(...Object.values(changes),now,eventId),
   db.prepare(`INSERT INTO audit_events(id,actor_user_id,action,resource_type,resource_id,metadata_json,created_at) VALUES (?,?,'event.enrich','event',?,?,?)`).bind(crypto.randomUUID(),actor.id,eventId,JSON.stringify(preview),now),
  ]);
  await finishEventOperation(db,previewId,true,['enrich']);return {eventId,previewId,changes};
 }catch(error){await finishEventOperation(db,previewId,false,[]);throw error;}
}
