import { Hono } from 'hono';
import { z } from 'zod';
import { organizationRole } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, previewFingerprint, claimEventOperation, finishEventOperation } from './eventOperationStore';
import { lifetechConstitution } from './documents/lifetechConstitution';

type Section = {id:string;title:string;text:string};
type Candidate = {organizationId:string|null;version:number;sections:Section[]};
type Draft = {id:string;owner_id:string;owner_name:string|null;name:string;head:number;updated_at:string};
const saveSchema=z.object({
 id:z.string().uuid(), expectedHead:z.number().int().min(0), name:z.string().trim().min(1).max(120),
 baseVersion:z.number().int().min(1), message:z.string().trim().min(1).max(500),
 sections:z.array(z.object({id:z.string().max(80),title:z.string().max(200),text:z.string().max(50000)}).strict()).length(9),
 sources:z.array(z.object({source:z.string().max(160),revision:z.string().max(100),sectionId:z.string().max(80),element:z.string().max(200)}).strict()).max(100),
 confirm:z.boolean().optional(),previewId:z.string().uuid().optional(),
}).strict();
function error(status:number,message:string):never {throw new EventIntegrationError(status,message)}

export function governancePersonalDraftRoutes(getUser:(env:Env,request:Request)=>Promise<{id:string}>,readDocument:(db:D1Database)=>Promise<Candidate>) {
 const app=new Hono<{Bindings:Env;Variables:{draftUser:string;draftOrg:string}}>();
 app.use('*',async(c,next)=>{
  const user=await getUser(c.env,c.req.raw);
  const org=await c.env.DB.prepare('SELECT id FROM organizations WHERE slug=?').bind(lifetechConstitution.organizationSlug).first<{id:string}>();
  if(!org||!await organizationRole(c.env.DB,org.id,user.id))error(403,'Active LifeTech membership required');
  c.set('draftUser',user.id);c.set('draftOrg',org.id);c.header('Cache-Control','no-store');
  await next();
 });
 app.get('/',async c=>{
  const search=(c.req.query('search')||'').slice(0,120),offset=Math.max(0,Number(c.req.query('offset'))||0);
  const rows=await c.env.DB.prepare(`SELECT d.id,d.owner_id,d.name,d.head,d.updated_at,COALESCE(m.user_name,'Member') AS owner_name
   FROM governance_personal_drafts d LEFT JOIN organization_memberships m ON m.organization_id=d.organization_id AND m.user_id=d.owner_id
   WHERE d.organization_id=? AND d.document_id=? AND d.head>0 AND (?='' OR instr(lower(d.name||' '||COALESCE(m.user_name,'')),lower(?))>0)
   ORDER BY d.updated_at DESC,d.id LIMIT 31 OFFSET ?`).bind(c.get('draftOrg'),lifetechConstitution.id,search,search,offset).all();
  return c.json({drafts:rows.results.slice(0,30),nextOffset:rows.results.length>30?offset+30:null});
 });
 app.get('/:id/history',async c=>{
  const before=Math.max(1,Number(c.req.query('before'))||Number.MAX_SAFE_INTEGER);
  const rows=await c.env.DB.prepare(`SELECT r.revision,r.parent_revision,r.base_version,r.content_hash,r.message,r.created_at
   FROM governance_personal_draft_revisions r JOIN governance_personal_drafts d ON d.id=r.draft_id
   WHERE d.id=? AND d.organization_id=? AND d.document_id=? AND r.revision<? ORDER BY r.revision DESC LIMIT 31`)
   .bind(c.req.param('id'),c.get('draftOrg'),lifetechConstitution.id,before).all();
  return c.json({revisions:rows.results.slice(0,30),nextBefore:rows.results.length>30?rows.results[29].revision:null});
 });
 app.get('/:id',async c=>{
  const draft=await c.env.DB.prepare('SELECT id,owner_id,name,head,updated_at,(SELECT user_name FROM organization_memberships WHERE organization_id=governance_personal_drafts.organization_id AND user_id=governance_personal_drafts.owner_id) AS owner_name FROM governance_personal_drafts WHERE id=? AND organization_id=? AND document_id=?')
   .bind(c.req.param('id'),c.get('draftOrg'),lifetechConstitution.id).first<Draft>();
  if(!draft)error(404,'Draft not found');
  const revision=c.req.query('revision')?Number(c.req.query('revision')):draft.head;
  const snapshot=await c.env.DB.prepare('SELECT * FROM governance_personal_draft_revisions WHERE draft_id=? AND revision=?').bind(draft.id,revision).first<{sections_json:string;base_sections_json:string;sources_json:string;revision:number;base_version:number;message:string;content_hash:string;created_at:string}>();
  if(!snapshot)error(404,'Revision not found');
  const {sections_json,base_sections_json,sources_json,...metadata}=snapshot;
  return c.json({draft,...metadata,sections:JSON.parse(sections_json),baseSections:JSON.parse(base_sections_json),sources:JSON.parse(sources_json)});
 });
 app.post('/',async c=>{
  const args=saveSchema.parse(await c.req.json());
  await enforceEventRateLimit(c.env.DB,c.get('draftUser'));
  const candidate=await readDocument(c.env.DB);
  if(args.baseVersion>candidate.version)error(409,'Invalid base revision');
  let baseSections=candidate.sections;
  if(args.baseVersion!==candidate.version) {
   const base=await c.env.DB.prepare('SELECT sections_json FROM governance_document_revisions WHERE document_id=? AND version=?').bind(lifetechConstitution.id,args.baseVersion).first<{sections_json:string}>();
   if(!base&&args.baseVersion!==1)error(409,'Base revision not found');
   const captured=await c.env.DB.prepare(`SELECT r.base_sections_json FROM governance_personal_draft_revisions r JOIN governance_personal_drafts d ON d.id=r.draft_id
    WHERE d.organization_id=? AND d.document_id=? AND r.base_version=? ORDER BY r.created_at,r.draft_id,r.revision LIMIT 1`)
    .bind(c.get('draftOrg'),lifetechConstitution.id,args.baseVersion).first<{base_sections_json:string}>();
   baseSections=base?JSON.parse(base.sections_json):captured?JSON.parse(captured.base_sections_json):lifetechConstitution.sections;
  }
  if(args.sections.some((section,index)=>section.id!==candidate.sections[index]?.id||section.title!==candidate.sections[index]?.title))error(400,'Keep the document section identifiers and titles');
  if(JSON.stringify(args.sections).length>350000)error(400,'Draft exceeds the document size limit');
  const draft=await c.env.DB.prepare('SELECT id,owner_id,name,head,updated_at,(SELECT user_name FROM organization_memberships WHERE organization_id=governance_personal_drafts.organization_id AND user_id=governance_personal_drafts.owner_id) AS owner_name FROM governance_personal_drafts WHERE id=? AND organization_id=? AND document_id=?')
   .bind(args.id,c.get('draftOrg'),lifetechConstitution.id).first<Draft>();
  if(draft&&draft.owner_id!==c.get('draftUser'))error(403,'Only the author can save this draft; copy it into your own');
  if((draft?.head||0)!==args.expectedHead)error(409,'A newer revision was saved elsewhere. Keep your edits and compare with the latest revision.');
  const {confirm,previewId,...payload}=args;
  const owner={userId:c.get('draftUser'),organizationId:c.get('draftOrg'),eventId:`governance:draft:${args.id}`};
  const fingerprint=await previewFingerprint(payload);
  if(!confirm)return c.json(await prepareEventOperation(c.env.DB,owner,fingerprint));
  if(!previewId)error(409,'Preview this saved revision first');
  await claimEventOperation(c.env.DB,owner,previewId,fingerprint);
  try {
   const now=new Date().toISOString(),revision=args.expectedHead+1,hash=await previewFingerprint(args.sections);
   const results=await c.env.DB.batch([
    c.env.DB.prepare(`INSERT OR IGNORE INTO governance_personal_drafts(id,organization_id,document_id,owner_id,name,head,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?)`)
     .bind(args.id,c.get('draftOrg'),lifetechConstitution.id,c.get('draftUser'),args.name,now,now),
    c.env.DB.prepare(`INSERT OR IGNORE INTO governance_personal_draft_revisions(draft_id,revision,parent_revision,base_version,sections_json,base_sections_json,content_hash,message,sources_json,created_at)
     SELECT id,?,?,?,?,?,?,?,?,? FROM governance_personal_drafts WHERE id=? AND owner_id=? AND organization_id=? AND head=?`)
     .bind(revision,args.expectedHead,args.baseVersion,JSON.stringify(args.sections),JSON.stringify(baseSections),hash,args.message,JSON.stringify(args.sources),now,args.id,c.get('draftUser'),c.get('draftOrg'),args.expectedHead),
    c.env.DB.prepare(`UPDATE governance_personal_drafts SET head=?,name=?,updated_at=? WHERE id=? AND owner_id=? AND head=? AND EXISTS(SELECT 1 FROM governance_personal_draft_revisions WHERE draft_id=? AND revision=? AND content_hash=?)`)
     .bind(revision,args.name,now,args.id,c.get('draftUser'),args.expectedHead,args.id,revision,hash),
   ]);
   if(!results[1].meta.changes)error(409,'Draft changed while saving. Your edits are retained; compare the latest revision before saving again.');
   await finishEventOperation(c.env.DB,previewId,true,[`revision:${revision}`]);
   return c.json({id:args.id,revision,contentHash:hash});
  } catch(e) {await finishEventOperation(c.env.DB,previewId,false,[]);throw e;}
 });
 return app;
}
