import {z} from 'zod';
import {authorizeOrganization,type OrganizationActor} from './organizationIam';
import {EventIntegrationError} from './eventPlatforms';
import {prepareEventOperation,claimEventOperation,finishEventOperation,previewFingerprint,enforceEventRateLimit} from './eventOperationStore';
const short=z.string().trim().max(1000),required=short.min(1);
const date=z.string().refine(s=>s===''||(/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s),'Use a valid date');
const url=z.string().max(2000).refine(s=>{if(!s)return true;try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password}catch{return false}},'Use a public HTTP or HTTPS URL');
export const initiativeSchema=z.object({
 id:z.string().uuid(),organizationId:z.string().min(1).max(200),revision:z.number().int().min(0),
 title:required,outcome:required,metric:required,unit:short,
 baseline:z.number().finite().nullable(),target:z.number().finite().nullable(),current:z.number().finite().nullable(),baselineDate:date,targetDate:date,measurementDate:date,
 authorityReferenceId:z.string().max(200),authority:short,authoritySourceUrl:url,instrument:z.enum(['legislation','regulation','budget','procurement','administrative','community']),decisionDate:date,
 nextAction:required,actionDueDate:date,constraints:short,facts:short,factSourceUrl:url,hypothesis:short,
 evidenceStatus:z.enum(['unreviewed','reviewed']),status:z.enum(['proposed','authorized','active','paused','completed']),authorizationUrl:url,result:short,resultSourceUrl:url,
}).strict().superRefine((v,c)=>{
 const fail=(message:string)=>c.addIssue({code:'custom',message});
 if(v.evidenceStatus==='reviewed'&&(!v.facts||!v.factSourceUrl))fail('Reviewed facts require a description and source');
 if(['authorized','active','completed'].includes(v.status)&&(!v.authorizationUrl||!v.authority||!v.authoritySourceUrl||v.baseline===null||v.target===null||!v.unit||!v.targetDate||!v.baselineDate||v.evidenceStatus!=='reviewed'))fail('Authorized work requires reviewed evidence, authority, baseline, target, unit, target date and authorization evidence');
 if(v.current!==null&&(!v.measurementDate||!v.resultSourceUrl))fail('A measurement requires its date and source');
 if(v.status==='completed'&&(v.current===null||!v.measurementDate||!v.result||!v.resultSourceUrl))fail('Completed work requires a measurement, result and source');
 if(v.baselineDate&&v.targetDate&&v.baselineDate>v.targetDate)fail('Target date must follow baseline date');
});
export async function publicInitiatives(db:D1Database,offset=0,query='',status='all'){
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000||query.length>128||!['all','overdue','proposed','authorized','active','paused','completed'].includes(status))throw new EventIntegrationError(400,'Invalid initiative filters');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const deadline="min(coalesce(nullif(json_extract(i.payload_json,'$.decisionDate'),''),'9999-12-31'),coalesce(nullif(json_extract(i.payload_json,'$.actionDueDate'),''),'9999-12-31'),coalesce(nullif(json_extract(i.payload_json,'$.targetDate'),''),'9999-12-31'))";
 const workStatus="json_extract(i.payload_json,'$.status')";
 const where=`instr(lower(json_extract(i.payload_json,'$.title')||' '||json_extract(i.payload_json,'$.outcome')||' '||json_extract(i.payload_json,'$.authority')||' '||o.name),?)>0 AND (?='all' OR (?='overdue' AND ${workStatus} NOT IN ('completed','paused') AND ${deadline}<?) OR ${workStatus}=?)`;
 const values=[query.toLowerCase(),status,status,today,status];
 const [result,total,summary]=await Promise.all([
  db.prepare(`SELECT i.*,o.name organization_name FROM ecosystem_initiatives i JOIN organizations o ON o.id=i.organization_id WHERE ${where} ORDER BY (${workStatus} IN ('completed','paused')),${deadline},i.id LIMIT 51 OFFSET ?`).bind(...values,offset).all<{payload_json:string;revision:number;organization_name:string;updated_at:string}>(),
  db.prepare(`SELECT count(*) total FROM ecosystem_initiatives i JOIN organizations o ON o.id=i.organization_id WHERE ${where}`).bind(...values).first<{total:number}>(),
  db.prepare(`SELECT count(*) total,coalesce(sum(${workStatus}='active'),0) active,coalesce(sum(${workStatus}='proposed'),0) proposed,coalesce(sum(${workStatus}='completed'),0) completed,coalesce(sum(${workStatus} NOT IN ('completed','paused') AND ${deadline}<?),0) overdue FROM ecosystem_initiatives i`).bind(today).first<{total:number;active:number;proposed:number;completed:number;overdue:number}>(),
 ]);
 return {records:result.results.slice(0,50).map(r=>({...JSON.parse(r.payload_json),revision:r.revision,organizationName:r.organization_name,updatedAt:r.updated_at})),nextOffset:result.results.length>50?offset+50:null,total:total?.total||0,summary};
}
export async function initiativeAccess(db:D1Database,actor:OrganizationActor){
 const result=await db.prepare(`SELECT o.id,o.name FROM organizations o WHERE ?=1 OR EXISTS(SELECT 1 FROM organization_memberships m WHERE m.organization_id=o.id AND m.user_id=? AND m.status='active' AND m.role IN ('owner','administrator')) ORDER BY o.name LIMIT 1000`).bind(actor.isOperator?1:0,actor.id).all();
 return {organizations:result.results};
}
export async function saveInitiative(db:D1Database,actor:OrganizationActor,input:unknown){
 const request=z.object({operation:z.enum(['save','delete']),initiative:initiativeSchema,previewId:z.string().uuid().optional(),confirm:z.boolean().optional()}).strict().safeParse(input);
 if(!request.success)throw new EventIntegrationError(400,request.error.issues.map(i=>i.message).join('; '));
 const {initiative,operation,confirm,previewId}=request.data;
 await authorizeOrganization(db,actor,'manage',initiative.organizationId);await enforceEventRateLimit(db,actor.id);
 const before=await db.prepare('SELECT organization_id,revision FROM ecosystem_initiatives WHERE id=?').bind(initiative.id).first<{organization_id:string;revision:number}>();
 if((before&&(before.organization_id!==initiative.organizationId||before.revision!==initiative.revision))||(!before&&(initiative.revision!==0||operation==='delete')))throw new EventIntegrationError(409,'Initiative changed or removed; reload before saving');
 const preview={operation,initiative,before,visibility:'Public planning record. Organization authorization does not establish government approval.'};
 const owner={userId:actor.id,organizationId:initiative.organizationId,eventId:'ecosystem:initiative:'+initiative.id};
 const fingerprint=await previewFingerprint(preview);
 if(!confirm)return {...preview,...await prepareEventOperation(db,owner,fingerprint)};
 if(!previewId)throw new EventIntegrationError(409,'Preview the change before confirming');
 await claimEventOperation(db,owner,previewId,fingerprint);
 const now=new Date().toISOString(),revision=initiative.revision+1,payload=JSON.stringify({...initiative,revision});
 try{
  const statements=before?[db.prepare('UPDATE ecosystem_initiatives SET payload_json=?,revision=?,updated_at=? WHERE id=?').bind(payload,revision,now,initiative.id)]:[db.prepare('INSERT INTO ecosystem_initiatives(id,organization_id,revision,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(initiative.id,initiative.organizationId,revision,payload,now,now)];
  if(operation==='delete')statements.push(db.prepare('DELETE FROM ecosystem_initiatives WHERE id=?').bind(initiative.id));
  statements.push(db.prepare(`INSERT INTO audit_events(id,actor_user_id,action,resource_type,resource_id,metadata_json,created_at) VALUES(?,?,?,'ecosystem_initiative',?,?,?)`).bind(crypto.randomUUID(),actor.id,'initiative.'+operation,initiative.id,JSON.stringify({organizationId:initiative.organizationId,revision}),now));
  await db.batch(statements);await finishEventOperation(db,previewId,true,[operation]);return {id:initiative.id,revision,operation};
 }catch(error){await finishEventOperation(db,previewId,false,[]);throw error}
}
export async function initiativeHistory(db:D1Database,id:string,offset=0){
 const result=await db.prepare('SELECT revision,payload_json,recorded_at FROM ecosystem_initiative_versions WHERE initiative_id=? ORDER BY revision DESC LIMIT 101 OFFSET ?').bind(id,offset).all<any>();
 return {records:result.results.slice(0,100).map(r=>({revision:r.revision,initiative:JSON.parse(r.payload_json),recordedAt:r.recorded_at})),nextOffset:result.results.length>100?offset+100:null};
}
