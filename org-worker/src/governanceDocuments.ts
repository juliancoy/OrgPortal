import { Hono } from 'hono';
import { z } from 'zod';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { lifetechConstitution } from './documents/lifetechConstitution';
import { organizationRole } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { runGovernanceOperation, type GovernanceAction, type GovernanceService } from './governanceMcp';

export type DocumentMotion = {
 document_action?:'amend'|'ratify'; ratification_snapshot?:string|null; ratification_hash?:string|null;
 ratification_authority?:string|null; ratification_notice_at?:string|null;
 id:string; document_id?:string|null; document_section?:string|null; document_version?:number|null;
 document_base?:string|null; electorate_json?:string|null; chair_id?:string|null;
 proposer_org_id:string|null; proposer_id:string; proposer_name:string; title:string; body:string;
 proposed_body_diff:string|null; status:string; created_at:string; voting_deadline:string|null;
 seconder_id:string|null; quorum_required:number; result:string|null;
};
function fail(status:number,message:string):never { throw new EventIntegrationError(status,message); }
const isOrganizer = (role:string|null) => role === 'owner' || role === 'administrator';
export async function documentOrganization(db:D1Database) {
 return db.prepare('SELECT id FROM organizations WHERE slug = ?').bind(lifetechConstitution.organizationSlug).first<{id:string}>();
}
type RatificationRecord = { version:number; motion_id:string; snapshot_json:string; snapshot_hash:string; ratified_at:string; effective_at:string };
export async function readGovernanceDocument(db:D1Database) {
 const latest=await db.prepare('SELECT version,sections_json,motion_id,created_at FROM governance_document_revisions WHERE document_id=? ORDER BY version DESC LIMIT 1')
  .bind(lifetechConstitution.id).first<{version:number;sections_json:string;motion_id:string;created_at:string}>();
 const ratified=await db.prepare('SELECT * FROM governance_document_ratifications WHERE document_id=?').bind(lifetechConstitution.id).first<RatificationRecord>();
 const adopted=ratified?JSON.parse(ratified.snapshot_json) as {title:string;sections:typeof lifetechConstitution.sections}:null;
 const pending=await db.prepare("SELECT id FROM governance_motions WHERE document_id=? AND document_action='ratify' AND status NOT IN ('passed','failed','withdrawn')")
  .bind(lifetechConstitution.id).first<{id:string}>();
 const open=await db.prepare("SELECT count(*) AS n FROM governance_motions WHERE document_id=? AND document_action='amend' AND status NOT IN ('passed','failed','withdrawn')")
  .bind(lifetechConstitution.id).first<{n:number}>();
 const document={...lifetechConstitution, title:adopted?.title||lifetechConstitution.title, version:latest?.version||ratified?.version||1,
  status:ratified?'Ratified constitution':'Unratified draft',
  introduction:ratified?'Ratified by LifeTech organizers. The adoption record preserves the full text, vote, and effective date. Subsequent adopted amendments are versioned separately.':lifetechConstitution.introduction,
  sections:latest ? JSON.parse(latest.sections_json) as typeof lifetechConstitution.sections : adopted?.sections||lifetechConstitution.sections,
  organizationId:(await documentOrganization(db))?.id||null, lastMotionId:latest?.motion_id||null,
  pendingRatificationId:pending?.id||null,openChangeTickets:open?.n||0,
  ratification:ratified?{version:ratified.version,motionId:ratified.motion_id,ratifiedAt:ratified.ratified_at,effectiveAt:ratified.effective_at,snapshotHash:ratified.snapshot_hash}:null};
 return {...document,candidateHash:await snapshotHash(snapshotDocument(document))};
}
function snapshotDocument(doc:{version:number;title:string;sections:typeof lifetechConstitution.sections}) {
 return JSON.stringify({documentId:lifetechConstitution.id,version:doc.version,title:doc.title,sections:doc.sections});
}
async function snapshotHash(text:string) {
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function constitutionalResult(votes:{choice:string}[], eligible:number) {
 const yea=votes.filter(v=>v.choice==='yea').length, nay=votes.filter(v=>v.choice==='nay').length;
 const abstain=votes.filter(v=>v.choice==='abstain').length, quorum=Math.floor(eligible/2)+1;
 return {yea,nay,abstain,total_votes:yea+nay,total_participants:votes.length,total_eligible:eligible,
  quorum_required:quorum,quorum_met:eligible>0&&votes.length>=quorum,
  passed:eligible>0&&votes.length>=quorum&&yea>0&&yea*3>=2*(yea+nay),threshold:'two-thirds'};
}
async function organizers(db:D1Database,organizationId:string) {
 const rows=await db.prepare("SELECT user_id FROM organization_memberships WHERE organization_id=? AND status='active' AND role IN ('owner','administrator') ORDER BY user_id")
  .bind(organizationId).all<{user_id:string}>();
 return rows.results.map(row=>row.user_id);
}
export async function documentMotionDetail(db:D1Database,motion:DocumentMotion) {
 const votes=await db.prepare('SELECT user_id,user_name,choice,cast_at FROM governance_votes WHERE motion_id=? ORDER BY cast_at').bind(motion.id).all<{user_id:string;choice:string}>();
 const events=await db.prepare('SELECT * FROM governance_motion_events WHERE motion_id=? ORDER BY created_at,id').bind(motion.id).all();
 const comments=await db.prepare('SELECT * FROM governance_comments WHERE motion_id=? ORDER BY created_at').bind(motion.id).all();
 const applied=await db.prepare('SELECT version FROM governance_document_revisions WHERE motion_id=?').bind(motion.id).first<{version:number}>();
 const ratification=await db.prepare('SELECT version,ratified_at,effective_at FROM governance_document_ratifications WHERE motion_id=?').bind(motion.id).first<{version:number;ratified_at:string;effective_at:string}>();
 return {motion, ratification, votes:votes.results,events:events.results,comments:comments.results,appliedVersion:applied?.version||null,
  results:motion.result ? JSON.parse(motion.result) : constitutionalResult(votes.results,JSON.parse(motion.electorate_json||'[]').length)};
}

/** Document tickets use the shared governance tables, IAM and receipt service. */
export async function executeDocumentMotion(db:D1Database,user:{id:string;name:string},action:GovernanceAction,
 motion:DocumentMotion|null,payload:Record<string,unknown>) {
 const doc=await readGovernanceDocument(db);
 const organizationId=motion?.proposer_org_id || String(payload.proposer_org_id||'');
 if(!doc.organizationId||organizationId!==doc.organizationId)fail(404,'LifeTech organization not found');
 const role=await organizationRole(db,organizationId,user.id);
 if(!role)fail(403,'Active LifeTech membership required');
 if(['second','recognize','give-notice','open-voting','vote','resolve'].includes(action)&&!isOrganizer(role))fail(403,'Only active LifeTech organizers may perform this action');
 const now=new Date().toISOString();
 const id=motion?.id || `mot-${crypto.randomUUID()}`;
 const event=(detail:string)=>db.prepare('INSERT INTO governance_motion_events(id,motion_id,actor_id,action,detail,created_at) VALUES(?,?,?,?,?,?)')
  .bind(crypto.randomUUID(),id,user.id,action,detail,now);
 if(action==='propose') {
  if(payload.type==='amendment'||payload.parent_motion_id)fail(400,'File an exact-text change ticket; nested amendments use a chaired meeting');
  if(payload.document_id!==doc.id)fail(404,'Document not found');
  if(doc.pendingRatificationId)fail(409,'Finish the active ratification ticket before proposing changes');
  if(payload.document_action==='ratify') {
   if(!isOrganizer(role))fail(403,'Only active LifeTech organizers may propose ratification');
   if(doc.ratification)fail(409,'The Constitution is already ratified; propose an amendment instead');
   if(doc.openChangeTickets)fail(409,'Resolve open change tickets before proposing ratification');
   if(payload.document_version!==doc.version)fail(409,'Document changed; reload the full candidate before proposing ratification');
   const authority=String(payload.ratification_authority||'').trim();
   if(authority.length<20||authority.length>10000)fail(400,'Record the prior organizer agreement authorizing this ratification procedure');
   const body=String(payload.body||'').trim();
   if(!body||body.length>10000)fail(400,'Provide the reason for ratification');
   const snapshot=snapshotDocument(doc),hash=await snapshotHash(snapshot);
   if(payload.ratification_hash!==hash)fail(409,'Candidate text changed; review it again before requesting ratification');
   await db.batch([
    db.prepare(`INSERT INTO governance_motions(id,type,title,body,status,proposer_type,proposer_id,proposer_name,proposer_org_id,created_at,updated_at,quorum_required,document_id,document_version,document_action,ratification_snapshot,ratification_hash,ratification_authority)
     VALUES(?,'main',?,?,'proposed','user',?,?,?,?,?,1,?,?,'ratify',?,?,?)`)
     .bind(id,`Ratify LifeTech Constitution — revision ${doc.version}`,body,user.id,user.name,organizationId,now,now,doc.id,doc.version,snapshot,hash,authority),
    event('Full Constitution captured for ratification; effective immediately upon recorded adoption.'),
   ]);
   return id;
  }
  const section=doc.sections.find(s=>s.id===payload.document_section);
  if(!section||payload.document_version!==doc.version)fail(409,'Document changed or section is invalid; reload before proposing');
  const title=String(payload.title||'').trim(),reason=String(payload.body||'').trim(),replacement=String(payload.proposed_body_diff||'').trim();
  if(!title||title.length>500||!reason||reason.length>10000||!replacement||replacement.length>50000)fail(400,'Provide a title, reason, and complete replacement text');
  if(replacement===section.text)fail(400,'The replacement must change the current text');
  await db.batch([
   db.prepare(`INSERT INTO governance_motions(id,type,title,body,proposed_body_diff,status,proposer_type,proposer_id,proposer_name,proposer_org_id,created_at,updated_at,quorum_required,document_id,document_section,document_version,document_base)
    VALUES(?,'main',?,?,?,'proposed','user',?,?,?,?,?,1,?,?,?,?)`)
    .bind(id,title,reason,replacement,user.id,user.name,organizationId,now,now,doc.id,section.id,doc.version,section.text),event('Filed an exact-text change to '+section.title+' at revision '+doc.version),
  ]);
  return id;
 }
 if(!motion||motion.document_id!==doc.id)fail(404,'Document ticket not found');
 const m=motion;
 const change=async(sql:string,values:(string|number|null)[],detail:string)=>{
  const result=await db.batch([db.prepare(sql).bind(...values),
   db.prepare(`INSERT INTO governance_motion_events(id,motion_id,actor_id,action,detail,created_at)
    SELECT ?,?,?,?,?,? WHERE changes()>0`).bind(crypto.randomUUID(),id,user.id,action,detail,now)]);
  if(!result[0].meta.changes)fail(409,'Ticket changed or this action is no longer available; reload');
 };
 if(action==='second') {
  if(m.proposer_id===user.id)fail(400,'Proposer cannot second their own motion');
  await change("UPDATE governance_motions SET status='seconded',seconder_id=?,seconder_name=?,updated_at=? WHERE id=? AND status='proposed'",[user.id,user.name,now,id],'Seconded for consideration');
 } else if(action==='recognize') {
  const note=String(payload.procedure_note||'').trim();
  if(!note)fail(400,'Record the chair stating the exact question');
  await change("UPDATE governance_motions SET status='discussion',chair_id=?,updated_at=? WHERE id=? AND status='seconded'",[user.id,now,id],note);
 } else if(action==='give-notice') {
  if(m.document_action!=='ratify'||m.chair_id!==user.id)fail(403,'Only the recorded chair gives ratification notice');
  const note=String(payload.procedure_note||'').trim();
  if(!note)fail(400,'Record delivery of the full candidate and ballot procedure to every organizer');
  if(payload.ratification_authorized!==true)fail(400,'Confirm the prior organizer agreement independently authorizes the ratification procedure');
  await change("UPDATE governance_motions SET ratification_notice_at=?,updated_at=? WHERE id=? AND status='discussion' AND ratification_notice_at IS NULL",[now,now,id],note);
 } else if(action==='open-voting') {
  if(m.chair_id!==user.id)fail(403,'The recorded chair opens the ballot');
  const noticeAt=m.document_action==='ratify'?m.ratification_notice_at:m.created_at;
  if(!noticeAt||Date.now()-Date.parse(noticeAt)<7*86400000)fail(409,'Seven full days of recorded notice are required before voting');
  if(m.document_action==='ratify'&&(doc.ratification||await snapshotHash(snapshotDocument(doc))!==m.ratification_hash))fail(409,'The ratification candidate changed or is already adopted; do not open this ballot');
  if(m.document_version!==doc.version)fail(409,'The document changed; file a rebased ticket');
  const note=String(payload.procedure_note||'').trim();
  if(!note)fail(400,'Record notice to every organizer and that debate is exhausted');
  const roll=await organizers(db,organizationId);
  if(roll.length<2)fail(409,'At least two active organizers are needed for this procedure');
  await change("UPDATE governance_motions SET status='voting',electorate_json=?,quorum_required=?,voting_deadline=?,updated_at=? WHERE id=? AND status='discussion'",
   [JSON.stringify(roll),Math.floor(roll.length/2)+1,new Date(Date.now()+86400000).toISOString(),now,id],note);
 } else if(action==='vote') {
  const roll=JSON.parse(m.electorate_json||'[]') as string[];
  if(!roll.includes(user.id))fail(403,'You are not on this ballot organizer roll');
  const choice=String(payload.choice||'');
  if(!['yea','nay','abstain'].includes(choice))fail(400,'Invalid ballot choice');
  await change(`INSERT INTO governance_votes(id,motion_id,user_id,user_name,choice,cast_at)
   SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM governance_motions WHERE id=? AND status='voting' AND voting_deadline>?)
   ON CONFLICT(motion_id,user_id) DO UPDATE SET choice=excluded.choice,user_name=excluded.user_name,cast_at=excluded.cast_at`,
   [crypto.randomUUID(),id,user.id,user.name,choice,now,id,now],'Recorded '+choice);
 } else if(action==='resolve') {
  if(m.chair_id!==user.id)fail(403,'The recorded chair announces the result');
  if(m.status!=='voting'||!m.voting_deadline||m.voting_deadline>now)fail(409,'Wait until the ballot deadline to resolve');
  const roll=JSON.parse(m.electorate_json||'[]') as string[];
  const current=await organizers(db,organizationId);
  const votes=await db.prepare('SELECT choice FROM governance_votes WHERE motion_id=?').bind(id).all<{choice:string}>();
  const ratifying=m.document_action==='ratify';
  const documentChanged=ratifying&&(m.document_version!==doc.version||await snapshotHash(snapshotDocument(doc))!==m.ratification_hash);
  const result={...constitutionalResult(votes.results,roll.length),electorate_changed:JSON.stringify(current)!==JSON.stringify(roll),document_changed:documentChanged};
  result.passed=result.passed&&!result.electorate_changed&&!documentChanged;
  if(ratifying) {
   if(doc.ratification)fail(409,'The Constitution already has a ratification record');
   if(!m.ratification_notice_at||!m.ratification_snapshot||!m.ratification_hash||!m.ratification_authority)fail(409,'Ratification record is incomplete');
   await db.batch([
    db.prepare(`INSERT INTO governance_document_ratifications(document_id,version,motion_id,snapshot_json,snapshot_hash,authority_record,ratified_at,effective_at)
     SELECT ?,?,?,?,?,?,?,? WHERE ?=1 AND EXISTS(SELECT 1 FROM governance_motions WHERE id=? AND status='voting')`)
     .bind(doc.id,m.document_version,id,m.ratification_snapshot,m.ratification_hash,m.ratification_authority,now,now,result.passed?1:0,id),
    db.prepare("UPDATE governance_motions SET status=?,result=?,updated_at=? WHERE id=? AND status='voting'")
     .bind(result.passed?'passed':'failed',JSON.stringify(result),now,id),
    db.prepare('INSERT INTO governance_motion_events(id,motion_id,actor_id,action,detail,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0')
     .bind(crypto.randomUUID(),id,user.id,action,result.passed?'Constitution ratified; effective immediately.':'Ratification did not pass; the document remains a draft.',now),
   ]);
   return id;
  }
  const sections=doc.sections.map(s=>s.id===m.document_section?{...s,text:m.proposed_body_diff!}:s);
  // A closed ballot is immutable. Conditional writes and the unique revision key
  // prevent a concurrent resolution from overwriting another accepted document.
  await db.batch([
   db.prepare(`INSERT OR IGNORE INTO governance_document_revisions(document_id,version,sections_json,motion_id,created_at)
    SELECT ?,?,?,?,? WHERE ?=1 AND COALESCE((SELECT MAX(version) FROM governance_document_revisions WHERE document_id=?),1)=?
    AND EXISTS(SELECT 1 FROM governance_motions WHERE id=? AND status='voting')`)
    .bind(doc.id,(m.document_version||1)+1,JSON.stringify(sections),id,now,result.passed?1:0,doc.id,m.document_version,id),
   db.prepare("UPDATE governance_motions SET status=?,result=?,updated_at=? WHERE id=? AND status='voting'")
    .bind(result.passed?'passed':'failed',JSON.stringify(result),now,id),
   db.prepare('INSERT INTO governance_motion_events(id,motion_id,actor_id,action,detail,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0')
    .bind(crypto.randomUUID(),id,user.id,action,JSON.stringify(result),now),
  ]);
 } else if(action==='withdraw') {
  if(m.proposer_id!==user.id)fail(403,'Only the proposer can withdraw an unseconded ticket');
  await change("UPDATE governance_motions SET status='withdrawn',updated_at=? WHERE id=? AND status='proposed'",[now,id],'Withdrawn before seconding');
 } else if(action==='comment') {
  const body=String(payload.body||'').trim();
  if(!body||body.length>10000)fail(400,'Provide a comment of at most 10000 characters');
  await db.batch([db.prepare('INSERT INTO governance_comments(id,motion_id,user_id,user_name,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
   .bind(crypto.randomUUID(),id,user.id,user.name,body,now,now),event('Discussion comment recorded')]);
 } else fail(400,'This parliamentary action requires a chaired meeting; record its proceedings in the discussion');
 return id;
}

export function governanceDocumentRoutes(getUser:(env:Env,request:Request)=>Promise<{id:string}>,service:(db:D1Database)=>GovernanceService) {
 const app=new Hono<{Bindings:Env}>();
 app.onError((error,c)=>{
  if(error instanceof EventIntegrationError)return c.json({detail:error.message},error.status as ContentfulStatusCode);
  if(error instanceof z.ZodError)return c.json({detail:'Invalid governance request',issues:error.issues},400);
  throw error;
 });
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next();});
 app.get('/lifetech-constitution',async c=>c.json(await readGovernanceDocument(c.env.DB)));
 app.get('/lifetech-constitution/tickets',async c=>{
  const rows=await c.env.DB.prepare('SELECT * FROM governance_motions WHERE document_id=? ORDER BY created_at DESC LIMIT 200').bind(lifetechConstitution.id).all<DocumentMotion>();
  return c.json({tickets:rows.results});
 });
 app.get('/lifetech-constitution/tickets/:id',async c=>{
  const motion=await c.env.DB.prepare('SELECT * FROM governance_motions WHERE id=? AND document_id=?').bind(c.req.param('id'),lifetechConstitution.id).first<DocumentMotion>();
  if(!motion)return c.json({detail:'Ticket not found'},404);
  return c.json(await documentMotionDetail(c.env.DB,motion));
 });
 app.get('/lifetech-constitution/access',async c=>{
  const user=await getUser(c.env,c.req.raw),org=await documentOrganization(c.env.DB);
  const role=org?await organizationRole(c.env.DB,org.id,user.id):null;
  return c.json({userId:user.id,role,canPropose:!!role,canVote:isOrganizer(role)});
 });
 app.post('/lifetech-constitution/operations',async c=>{
  const user=await getUser(c.env,c.req.raw);
  const input=await c.req.json<{operation:string;args:Record<string,unknown>}>();
  const org=await documentOrganization(c.env.DB);
  if(!org||input.args?.organizationId!==org.id)fail(404,'LifeTech organization not found');
  if(!['propose','action'].includes(input.operation))fail(400,'Invalid operation');
  if(input.operation==='propose') {
   const change=(input.args.documentChange||input.args.documentRatification) as {documentId?:string}|undefined;
   if(change?.documentId!==lifetechConstitution.id)fail(400,'Document change required');
  } else {
   const motion=await c.env.DB.prepare('SELECT id FROM governance_motions WHERE id=? AND document_id=? AND proposer_org_id=?')
    .bind(input.args.motionId,lifetechConstitution.id,org.id).first();
   if(!motion)fail(404,'Ticket not found');
  }
  return c.json(await runGovernanceOperation(c.env.DB,{userId:user.id,scopes:['org:portal.read','org:portal.write']},input.operation as 'propose'|'action',input.args,service(c.env.DB)));
 });
 return app;
}
