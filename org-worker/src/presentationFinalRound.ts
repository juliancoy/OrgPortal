import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authorizeOrganization, type OrganizationActor } from './organizationIam';
import { presentationVotingWindow } from './presentationVotingWindow';

type Env = { DB: D1Database };
const active = "s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const live = "r.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')";
type ReviewedRound = {startsAt:string|null;endsAt:string|null;before:{phase:string;finalist_ids_json:string;expires_at:string}|null};
export function presentationFinalRoundRoutes<E extends Env>(auth:(env:E,request:Request)=>Promise<{id:string}>,reviewed?:ReviewedRound) {
 const app=new Hono<{Bindings:E}>();
 async function event(db:D1Database,id:string) {
  const row=await db.prepare('SELECT id,host_org_id,starts_at,ends_at FROM events WHERE id=? AND host_org_id IS NOT NULL').bind(id).first<{id:string;host_org_id:string;starts_at:string|null;ends_at:string|null}>();
  if(!row)throw new HTTPException(404,{message:'Hosted event not found'});
  return row;
 }
 app.get('/:id/presentations/final-round',async c=>{
  const e=await event(c.env.DB,c.req.param('id'));
  const round=await c.env.DB.prepare(`SELECT phase,finalist_ids_json FROM event_presentation_final_rounds r WHERE event_id=? AND ${live}`).bind(e.id).first<{phase:string;finalist_ids_json:string}>();
  const results=round?await c.env.DB.prepare(`SELECT s.submission_id,s.title,o.name AS organization_name,
   (SELECT COUNT(*) FROM event_presentation_final_ballots b WHERE b.event_id=s.event_id AND b.submission_id=s.submission_id AND b.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS votes
   FROM event_submissions s JOIN organizations o ON o.id=s.organization_id
   WHERE s.event_id=? AND s.submission_id IN (SELECT value FROM json_each(?)) AND ${active}
   ORDER BY votes DESC,o.name COLLATE NOCASE,s.title COLLATE NOCASE,s.submission_id`).bind(e.id,round.finalist_ids_json).all():{results:[]};
  const window=presentationVotingWindow(e);
  return c.json({phase:round?.phase==='open'&&window.votingClosed?'closed':round?.phase||'shortlist',...window,finalistIds:round?JSON.parse(round.finalist_ids_json) as string[]:[],results:results.results});
 });
 app.put('/:id/presentations/final-round',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));
  await authorizeOrganization(c.env.DB,{...user,name:user.id,email:null,isOperator:false} as OrganizationActor,'manage',e.host_org_id);
  const body=await c.req.json().catch(()=>null);
  if(!body||!['shortlist','open','closed'].includes(body.phase)||!Array.isArray(body.finalistIds)||body.finalistIds.length<1||body.finalistIds.length>20||body.finalistIds.some((id:unknown)=>typeof id!=='string'||!id||id.length>200)||new Set(body.finalistIds).size!==body.finalistIds.length||Object.keys(body).some(key=>!['phase','finalistIds'].includes(key)))throw new HTTPException(400,{message:'Choose 1–20 different finalists and a valid voting phase'});
  const ids=JSON.stringify([...body.finalistIds].sort());
  if(body.phase==='open'&&presentationVotingWindow(e).votingClosed)throw new HTTPException(409,{message:'Voting closed one week after the event ended.'});
  // Validate candidates and lock the shortlist in the write, including competing host requests.
  const result=await c.env.DB.prepare(`INSERT INTO event_presentation_final_rounds(event_id,phase,finalist_ids_json,expires_at)
   SELECT e.id,?,?,strftime('%Y-%m-%dT%H:%M:%fZ',COALESCE(e.ends_at,e.starts_at),'+90 days') FROM events e
   WHERE e.id=? AND julianday(COALESCE(e.ends_at,e.starts_at),'+90 days')>julianday('now')
   AND (?!='open' OR julianday(COALESCE(e.ends_at,e.starts_at),'+7 days')>julianday('now'))
   AND e.host_org_id=? AND EXISTS(SELECT 1 FROM organization_memberships m WHERE m.organization_id=e.host_org_id AND m.user_id=? AND m.status='active' AND m.role IN ('owner','administrator'))
   AND (?=0 OR (e.starts_at IS ? AND e.ends_at IS ? AND (
    (?=0 AND NOT EXISTS(SELECT 1 FROM event_presentation_final_rounds WHERE event_id=e.id))
    OR (?=1 AND EXISTS(SELECT 1 FROM event_presentation_final_rounds WHERE event_id=e.id AND phase=? AND finalist_ids_json=? AND expires_at=?)))))
   AND ((SELECT COUNT(*) FROM event_submissions s WHERE s.event_id=e.id AND s.submission_id IN (SELECT value FROM json_each(?)) AND ${active} AND s.status!='declined')=?
    OR EXISTS(SELECT 1 FROM event_presentation_final_rounds r WHERE r.event_id=e.id AND r.phase IN ('open','closed') AND r.finalist_ids_json=? AND ${live}))
   AND (?!='closed' OR EXISTS(SELECT 1 FROM event_presentation_final_rounds r WHERE r.event_id=e.id AND r.phase IN ('open','closed') AND ${live}))
   ON CONFLICT(event_id) DO UPDATE SET phase=excluded.phase,finalist_ids_json=excluded.finalist_ids_json
   WHERE event_presentation_final_rounds.phase='shortlist' OR (excluded.phase IN ('open','closed') AND event_presentation_final_rounds.finalist_ids_json=excluded.finalist_ids_json)`)
   .bind(body.phase,ids,e.id,body.phase,e.host_org_id,user.id,reviewed?1:0,reviewed?.startsAt??null,reviewed?.endsAt??null,reviewed?.before?1:0,reviewed?.before?1:0,reviewed?.before?.phase??null,reviewed?.before?.finalist_ids_json??null,reviewed?.before?.expires_at??null,ids,body.finalistIds.length,ids,body.phase).run();
  if(!result.meta.changes)throw new HTTPException(409,{message:'Finalists must be available and cannot change after voting opens. Refresh the round before trying again.'});
  return c.json({saved:true});
 });
 app.get('/:id/presentations/final-ballot',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));
  const row=await c.env.DB.prepare(`SELECT b.submission_id FROM event_presentation_final_ballots b JOIN event_submissions s ON s.event_id=b.event_id AND s.submission_id=b.submission_id WHERE b.event_id=? AND b.user_id=? AND ${active} AND b.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(e.id,user.id).first<{submission_id:string}>();
  return c.json({submissionId:row?.submission_id||null});
 });
 app.put('/:id/presentations/final-ballot',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id')),body=await c.req.json().catch(()=>null);
  if(!body||typeof body.submissionId!=='string'||Object.keys(body).some(key=>key!=='submissionId'))throw new HTTPException(400,{message:'Choose one finalist'});
  // One row per event/account makes retries and changing a vote atomic and idempotent.
  const saved=await c.env.DB.prepare(`INSERT INTO event_presentation_final_ballots(event_id,user_id,submission_id,expires_at)
   SELECT s.event_id,?,s.submission_id,MIN(s.expires_at,r.expires_at) FROM event_submissions s JOIN event_presentation_final_rounds r ON r.event_id=s.event_id
   WHERE s.event_id=? AND s.submission_id=? AND ${active} AND ${live} AND r.phase='open' AND s.submission_id IN (SELECT value FROM json_each(r.finalist_ids_json))
   AND EXISTS(SELECT 1 FROM events e WHERE e.id=s.event_id AND julianday(COALESCE(e.ends_at,e.starts_at),'+7 days')>julianday('now'))
   ON CONFLICT(event_id,user_id) DO UPDATE SET submission_id=excluded.submission_id,expires_at=excluded.expires_at`).bind(user.id,e.id,body.submissionId).run();
  if(!saved.meta.changes)throw new HTTPException(409,{message:'Final voting is closed or this finalist is no longer available'});
  return c.json({submissionId:body.submissionId});
 });
 return app;
}
