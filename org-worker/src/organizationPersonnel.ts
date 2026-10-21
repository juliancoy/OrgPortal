import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { authorizeOrganization, organizationRole, OrganizationIamError } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { prepareEventOperation, claimEventOperation, finishEventOperation, previewFingerprint, enforceEventRateLimit } from './eventOperationStore';
import type { PersonnelClass } from '../../shared/organizationPersonnel';

type Env = { DB: D1Database };
type Actor = { id: string };
type Motion = { id:string; organization_id:string; target_user_id:string; decision:'exclude'|'readmit'; status:string; proposer_id:string; seconder_id:string|null; chair_id:string|null; procedure_note:string|null; electorate_json:string; voting_deadline:string|null; result_json:string|null; created_at:string; updated_at:string; review_at:string };
const targetId = z.string().trim().min(1).max(200);
const receipt = { previewId:z.string().uuid().optional(),confirm:z.boolean().optional() };
const volunteerSchema = z.object({targetUserId:targetId,action:z.enum(['award','revoke']),...receipt}).strict();
const motionSchema = z.object({action:z.enum(['propose','second','open-voting','vote','resolve','withdraw']),motionId:targetId.optional(),
 targetUserId:targetId.optional(),decision:z.enum(['exclude','readmit']).optional(),choice:z.enum(['yea','nay','abstain']).optional(),
 procedureNote:z.string().trim().min(20).max(2000).optional(),fairReviewCompleted:z.boolean().optional(),...receipt}).strict();
const fail=(code:number,message:string):never=>{throw new EventIntegrationError(code,message)};
export function monthsAfter(date:Date,months:number) {
 const result=new Date(date); const day=result.getUTCDate();result.setUTCDate(1);result.setUTCMonth(result.getUTCMonth()+months);
 const end=new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate();result.setUTCDate(Math.min(day,end));return result.toISOString();
}
async function orgId(db:D1Database,value:string) {
 const org=await db.prepare('SELECT id FROM organizations WHERE id=? OR slug=?').bind(value,value).first<{id:string}>();
 if(!org)fail(404,'Organization not found');return org!.id;
}
async function organizers(db:D1Database,org:string) {
 const rows=await db.prepare("SELECT user_id FROM organization_memberships WHERE organization_id=? AND status='active' AND role IN ('owner','administrator') ORDER BY user_id").bind(org).all<{user_id:string}>();return rows.results.map(row=>row.user_id);
}
async function latestDecision(db:D1Database,org:string,user:string) {
 return db.prepare("SELECT * FROM organization_personnel_motions WHERE organization_id=? AND target_user_id=? AND status='passed' ORDER BY updated_at DESC,id DESC LIMIT 1").bind(org,user).first<Motion>();
}
export function personnelVoteResult(votes:{choice:string}[],eligible:number) {
 const yea=votes.filter(v=>v.choice==='yea').length,nay=votes.filter(v=>v.choice==='nay').length,abstain=votes.filter(v=>v.choice==='abstain').length;
 const quorum=Math.floor(eligible/2)+1;
 return {yea,nay,abstain,eligible,quorum,participants:votes.length,passed:eligible>0&&votes.length>=quorum&&yea>nay,threshold:'majority'};
}

// One scoped read, no per-avatar network requests. RSVPs establish attendee status.
export async function organizationPersonnel(db:D1Database,org:string,now=new Date().toISOString()) {
 const members=await db.prepare("SELECT user_id,user_name,role FROM organization_memberships WHERE organization_id=? AND status='active'").bind(org).all<{user_id:string;user_name:string|null;role:string}>();
 const attendees=await db.prepare(`SELECT DISTINCT r.user_id FROM event_registrations r JOIN events e ON e.id=r.event_id
  WHERE e.host_org_id=? AND COALESCE(e.ends_at,e.starts_at,e.event_date,r.registered_at)>=?`).bind(org,monthsAfter(new Date(now),-3)).all<{user_id:string}>();
 const volunteers=await db.prepare('SELECT user_id FROM organization_volunteer_awards WHERE organization_id=? AND expires_at>?').bind(org,now).all<{user_id:string}>();
 // The same evidence-backed edges used by organization support reports. Voided,
 // generic affiliation/portfolio/terms and uncommitted financing are excluded.
 const stakeholders=await db.prepare(`WITH edges(a,b) AS (
   SELECT from_organization_id,to_organization_id FROM organization_support_edges
   UNION SELECT from_organization_id,to_organization_id FROM master_transaction_records WHERE record_type='company_financing'
    AND transaction_type IN ('agency','equity','debt','grant') AND amount_label!='up-to'
    AND from_organization_id IS NOT NULL AND to_organization_id IS NOT NULL
  ), related(id) AS (SELECT b FROM edges WHERE a=? UNION SELECT a FROM edges WHERE b=?)
  SELECT DISTINCT m.user_id FROM organization_memberships m JOIN related r ON r.id=m.organization_id WHERE m.status='active' AND m.organization_id!=?`).bind(org,org,org).all<{user_id:string}>();
 const decisions=await db.prepare(`SELECT target_user_id,decision FROM organization_personnel_motions m WHERE organization_id=? AND status='passed'
  AND NOT EXISTS(SELECT 1 FROM organization_personnel_motions newer WHERE newer.organization_id=m.organization_id AND newer.target_user_id=m.target_user_id AND newer.status='passed' AND (newer.updated_at>m.updated_at OR (newer.updated_at=m.updated_at AND newer.id>m.id)))`).bind(org).all<{target_user_id:string;decision:string}>();
 const classes:Record<string,PersonnelClass>={};
 for(const row of stakeholders.results)classes[row.user_id]='stakeholder';
 for(const row of attendees.results)classes[row.user_id]='attendee';
 for(const row of volunteers.results)classes[row.user_id]='volunteer';
 for(const row of members.results)classes[row.user_id]=row.role==='owner'||row.role==='administrator'?'organizer':'member';
 for(const row of decisions.results)if(row.decision==='exclude')classes[row.target_user_id]='persona_non_grata';
 return classes;
}

export function organizationPersonnelRoutes<E extends Env>(auth:(env:E,request:Request)=>Promise<Actor>) {
 const app=new Hono<{Bindings:E}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next()});
 app.onError((error,c)=> {
  if(error instanceof HTTPException)return error.getResponse();
  if(error instanceof z.ZodError)return c.json({error:'Invalid personnel request'},400);
  if(error instanceof EventIntegrationError || error instanceof OrganizationIamError)return c.json({error:error.message},error.status as ContentfulStatusCode);
  return c.json({error:'Could not load organization personnel'},500);
 });
 app.get('/:organizationId/personnel',async c=>{
  const actor=await auth(c.env,c.req.raw),org=await orgId(c.env.DB,c.req.param('organizationId'));
  await authorizeOrganization(c.env.DB,{...actor,name:actor.id,email:null,isOperator:false},'read_members',org);
  const classes=await organizationPersonnel(c.env.DB,org);
  const portraits=await c.env.DB.prepare('SELECT user_id,photo_url FROM user_contact_pages WHERE enabled=1 AND user_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(Object.keys(classes))).all<{user_id:string;photo_url:string|null}>();
  return c.json({organizationId:org,classes,photos:Object.fromEntries(portraits.results.map(row=>[row.user_id,row.photo_url]))});
 });
 app.get('/:organizationId/personnel/motions',async c=>{
  const actor=await auth(c.env,c.req.raw),org=await orgId(c.env.DB,c.req.param('organizationId'));
  await authorizeOrganization(c.env.DB,{...actor,name:actor.id,email:null,isOperator:false},'manage',org);
  const rows=await c.env.DB.prepare('SELECT * FROM organization_personnel_motions WHERE organization_id=? ORDER BY created_at DESC').bind(org).all<Motion>();
  return c.json({motions:rows.results});
 });
 app.post('/:organizationId/personnel/volunteers/:operation',async c=>{
  const actor=await auth(c.env,c.req.raw),db=c.env.DB,org=await orgId(db,c.req.param('organizationId'));
  const role=await organizationRole(db,org,actor.id);if(!role)fail(403,'Active membership required to award volunteer status');
  const operation=c.req.param('operation');if(!['preview','apply'].includes(operation))fail(404,'Operation not found');
  const args=volunteerSchema.parse(await c.req.json());
  const before=await db.prepare('SELECT * FROM organization_volunteer_awards WHERE organization_id=? AND user_id=?').bind(org,args.targetUserId).first<{awarded_by:string}>();
  if(args.action==='revoke'&&role==='member'&&before?.awarded_by!==actor.id)fail(403,'Only the awarding member or an organizer can revoke this award');
  const known=await db.prepare('SELECT user_id FROM user_contact_pages WHERE user_id=? UNION SELECT user_id FROM organization_memberships WHERE user_id=? LIMIT 1').bind(args.targetUserId,args.targetUserId).first();
  if(!known)fail(404,'Account not found; select its exact account ID from the directory');
  const changes={targetUserId:args.targetUserId,action:args.action};
  const owner={userId:actor.id,organizationId:org,eventId:'personnel:volunteer'};
  const fingerprint=await previewFingerprint({changes,before});await enforceEventRateLimit(db,actor.id);
  if(operation==='preview')return c.json({changes,before,...await prepareEventOperation(db,owner,fingerprint)});
  if(args.confirm!==true||!args.previewId)fail(409,'Review and confirm this award first');
  await claimEventOperation(db,owner,args.previewId!,fingerprint);
  try{
   const now=new Date();
   if(args.action==='award')await db.prepare(`INSERT INTO organization_volunteer_awards(organization_id,user_id,awarded_by,awarded_at,expires_at) VALUES(?,?,?,?,?)
    ON CONFLICT(organization_id,user_id) DO UPDATE SET awarded_by=excluded.awarded_by,awarded_at=excluded.awarded_at,expires_at=excluded.expires_at`).bind(org,args.targetUserId,actor.id,now.toISOString(),monthsAfter(now,3)).run();
   else await db.prepare('DELETE FROM organization_volunteer_awards WHERE organization_id=? AND user_id=?').bind(org,args.targetUserId).run();
   await finishEventOperation(db,args.previewId!,true,[args.action]);return c.json({saved:true});
  }catch(error){await finishEventOperation(db,args.previewId!,false,[]);throw error}
 });
 app.post('/:organizationId/personnel/motions/:operation',async c=>{
  const actor=await auth(c.env,c.req.raw),db=c.env.DB,org=await orgId(db,c.req.param('organizationId'));
  await authorizeOrganization(db,{...actor,name:actor.id,email:null,isOperator:false},'manage',org);
  const operation=c.req.param('operation');if(!['preview','apply'].includes(operation))fail(404,'Operation not found');
  const args=motionSchema.parse(await c.req.json()),now=new Date().toISOString();
  const before=args.motionId?await db.prepare('SELECT * FROM organization_personnel_motions WHERE id=? AND organization_id=?').bind(args.motionId,org).first<Motion>():null;
  if(args.action!=='propose'&&!before)fail(404,'Personnel motion not found in this organization');
  const roll=await organizers(db,org);
  if(args.action==='propose'){
   if(!args.targetUserId||!args.decision)fail(400,'Select the exact account and decision');
   if(args.decision==='readmit'){
    const previous=await latestDecision(db,org,args.targetUserId!);
    if(previous?.decision!=='exclude')fail(409,'No exclusion to reconsider');
    if(monthsAfter(new Date(previous!.updated_at),24)>now)fail(409,'The constitutional reapplication period is two years');
   }
  }else if(args.action==='second'){
   if(before!.status!=='proposed'||before!.proposer_id===actor.id)fail(409,'A different organizer must second a proposed motion');
  }else if(args.action==='open-voting'){
   if(before!.status!=='discussion'||!before!.seconder_id)fail(409,'Second the motion and complete discussion first');
   if(!args.procedureNote||args.fairReviewCompleted!==true)fail(400,'Record notice to every organizer, the exact question, exhausted debate and a fair opportunity to respond');
  }else if(args.action==='vote'){
   if(before!.status!=='voting'||!before!.voting_deadline||before!.voting_deadline<=now)fail(409,'Voting is closed');
   if(!(JSON.parse(before!.electorate_json) as string[]).includes(actor.id))fail(403,'Only organizers on the opening roll may vote');
   if(!args.choice)fail(400,'Choose yea, nay or abstain');
  }else if(args.action==='resolve'){
   if(before!.status!=='voting'||!before!.voting_deadline||before!.voting_deadline>now)fail(409,'Wait until the ballot deadline');
  }else if(args.action==='withdraw'){
   if(before!.status!=='proposed'||before!.proposer_id!==actor.id)fail(403,'Only the proposer can withdraw a proposed motion');
  }
  const votes=before?await db.prepare('SELECT user_id,choice,cast_at FROM organization_personnel_votes WHERE motion_id=? ORDER BY user_id').bind(before.id).all<{user_id:string;choice:string;cast_at:string}>():{results:[]};
  const {confirm,previewId,...changes}=args;
  const fingerprint=await previewFingerprint({changes,before,roll,votes:votes.results});
  const owner={userId:actor.id,organizationId:org,eventId:'personnel:motion'};await enforceEventRateLimit(db,actor.id);
  if(operation==='preview')return c.json({changes,before,...await prepareEventOperation(db,owner,fingerprint)});
  if(confirm!==true||!previewId)fail(409,'Preview and confirm this motion action first');
  await claimEventOperation(db,owner,previewId!,fingerprint);
  try{
   let id=before?.id||crypto.randomUUID();
   if(args.action==='propose')await db.prepare(`INSERT INTO organization_personnel_motions(id,organization_id,target_user_id,decision,proposer_id,created_at,updated_at,review_at) VALUES(?,?,?,?,?,?,?,?)`).bind(id,org,args.targetUserId!,args.decision!,actor.id,now,now,monthsAfter(new Date(now),24)).run();
   else if(args.action==='second')await db.prepare("UPDATE organization_personnel_motions SET status='discussion',seconder_id=?,updated_at=? WHERE id=? AND status='proposed'").bind(actor.id,now,id).run();
   else if(args.action==='open-voting')await db.prepare("UPDATE organization_personnel_motions SET status='voting',chair_id=?,procedure_note=?,electorate_json=?,voting_deadline=?,updated_at=? WHERE id=? AND status='discussion'").bind(actor.id,args.procedureNote!,JSON.stringify(roll),new Date(Date.parse(now)+86400000).toISOString(),now,id).run();
   else if(args.action==='vote')await db.prepare(`INSERT INTO organization_personnel_votes(motion_id,user_id,choice,cast_at) VALUES(?,?,?,?) ON CONFLICT(motion_id,user_id) DO UPDATE SET choice=excluded.choice,cast_at=excluded.cast_at`).bind(id,actor.id,args.choice!,now).run();
   else if(args.action==='withdraw')await db.prepare("UPDATE organization_personnel_motions SET status='withdrawn',updated_at=? WHERE id=?").bind(now,id).run();
   else if(args.action==='resolve'){
    const snapshot=JSON.parse(before!.electorate_json) as string[];
    const result={...personnelVoteResult(votes.results.filter(v=>snapshot.includes(v.user_id)),snapshot.length),electorate_changed:JSON.stringify(roll)!==JSON.stringify(snapshot)};
    result.passed=result.passed&&!result.electorate_changed;
    await db.prepare('UPDATE organization_personnel_motions SET status=?,result_json=?,updated_at=?,review_at=? WHERE id=? AND status=\'voting\'').bind(result.passed?'passed':'failed',JSON.stringify(result),now,monthsAfter(new Date(now),24),id).run();
   }
   await finishEventOperation(db,previewId!,true,[args.action]);return c.json({saved:true,motionId:id});
  }catch(error){await finishEventOperation(db,previewId!,false,[]);throw error}
 });
 return app;
}
