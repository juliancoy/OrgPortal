import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

const nomination = z.object({
 name:z.string().trim().min(1).max(120),
 accomplishment:z.string().trim().min(1).max(2000),
 connection:z.string().trim().min(1).max(500),
 profileUrl:z.string().url().max(1000).refine(value=>new URL(value).protocol==='https:').nullable().optional(),
 eligible:z.literal(true), consent:z.literal(true),
}).strict();
export const recognitionVoteLimit=(count:number)=>Math.ceil(count/4);
type Nominee={id:string;name:string;accomplishment:string;connection:string;profile_url:string|null;created_at:string;expires_at:string};

export function organizationRecognitionRoutes(auth:(env:Env,request:Request)=>Promise<{id:string}>) {
 const app=new Hono<{Bindings:Env}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next()});
 async function organization(db:D1Database,slug:string) {
  const org=await db.prepare('SELECT id,name,slug FROM organizations WHERE slug=?').bind(slug).first<{id:string;name:string;slug:string}>();
  if(!org)throw new HTTPException(404,{message:'Organization not found.'});return org;
 }
 async function active(db:D1Database,org:string) {
  return (await db.prepare(`SELECT id,name,accomplishment,connection,profile_url,created_at,expires_at
   FROM organization_recognition_nominees WHERE organization_id=? AND expires_at>? ORDER BY created_at,id`).bind(org,new Date().toISOString()).all<Nominee>()).results;
 }
 // Only these explicitly public fields leave the server; neither authors nor ballots are exposed.
 app.get('/:slug/five-over-five',async c=>{
  const org=await organization(c.env.DB,c.req.param('slug')),rows=await active(c.env.DB,org.id),limit=recognitionVoteLimit(rows.length);
  const votes=await c.env.DB.prepare(`WITH eligible AS (
   SELECT b.user_id,j.value AS id,ROW_NUMBER() OVER(PARTITION BY b.user_id ORDER BY j.key) AS choice
   FROM organization_recognition_ballots b,json_each(b.selections) j
   JOIN organization_recognition_nominees n ON n.id=j.value AND n.organization_id=b.organization_id
   WHERE b.organization_id=? AND b.expires_at>? AND n.expires_at>?
  ) SELECT id,COUNT(*) AS votes FROM eligible WHERE choice<=? GROUP BY id`)
   .bind(org.id,new Date().toISOString(),new Date().toISOString(),limit).all<{id:string;votes:number}>();
  const totals=new Map(votes.results.map(row=>[row.id,row.votes]));
  return c.json({organization:org,limit,nominees:rows.map(row=>({...row,votes:totals.get(row.id)||0})).sort((a,b)=>b.votes-a.votes||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))});
 });
 app.get('/:slug/five-over-five/mine',async c=>{
  const user=await auth(c.env,c.req.raw),org=await organization(c.env.DB,c.req.param('slug')),rows=await active(c.env.DB,org.id);
  const ballot=await c.env.DB.prepare('SELECT selections FROM organization_recognition_ballots WHERE organization_id=? AND user_id=? AND expires_at>?').bind(org.id,user.id,new Date().toISOString()).first<{selections:string}>();
  const owned=await c.env.DB.prepare('SELECT id FROM organization_recognition_nominees WHERE organization_id=? AND submitted_by=? AND expires_at>?').bind(org.id,user.id,new Date().toISOString()).all<{id:string}>();
  const role=await c.env.DB.prepare("SELECT role FROM organization_memberships WHERE organization_id=? AND user_id=? AND status='active'").bind(org.id,user.id).first<{role:string}>();
  return c.json({selections:(JSON.parse(ballot?.selections||'[]') as string[]).filter(id=>rows.some(row=>row.id===id)).slice(0,recognitionVoteLimit(rows.length)),owned:owned.results.map(row=>row.id),canModerate:['owner','administrator'].includes(role?.role||'')});
 });
 app.post('/:slug/five-over-five/nominees',async c=>{
  const user=await auth(c.env,c.req.raw),org=await organization(c.env.DB,c.req.param('slug'));
  const parsed=nomination.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)throw new HTTPException(400,{message:'Provide a name, accomplishments, community connection, HTTPS profile link if supplied, and confirm eligibility and permission.'});
  const body=parsed.data,id=crypto.randomUUID(),now=new Date().toISOString(),expiry=new Date(Date.now()+365*86400_000).toISOString();
  const result=await c.env.DB.prepare(`INSERT INTO organization_recognition_nominees(id,organization_id,submitted_by,name,accomplishment,connection,profile_url,created_at,expires_at)
   SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM organization_recognition_nominees WHERE organization_id=?)<500
   AND (SELECT COUNT(*) FROM organization_recognition_nominees WHERE organization_id=? AND submitted_by=?)<10
   ON CONFLICT DO NOTHING`).bind(id,org.id,user.id,body.name,body.accomplishment,body.connection,body.profileUrl||null,now,expiry,org.id,org.id,user.id).run();
  if(!result.meta.changes)throw new HTTPException(409,{message:'That person is already nominated, or the nomination limit has been reached (10 per person, 500 total).'});
  return c.json({id},201);
 });
 app.put('/:slug/five-over-five/ballot',async c=>{
  const user=await auth(c.env,c.req.raw),org=await organization(c.env.DB,c.req.param('slug'));
  const parsed=z.object({selections:z.array(z.string().uuid()).max(125)}).strict().safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success||new Set(parsed.data.selections).size!==parsed.data.selections.length)throw new HTTPException(400,{message:'Choose each nominee at most once.'});
  const json=JSON.stringify(parsed.data.selections),now=new Date().toISOString(),expiry=new Date(Date.now()+365*86400_000).toISOString();
  // Validate the complete ballot, tenant and dynamic cap in the same atomic write.
  const result=await c.env.DB.prepare(`INSERT INTO organization_recognition_ballots(organization_id,user_id,selections,expires_at)
   SELECT ?,?,?,? WHERE json_array_length(?) <= (SELECT (COUNT(*)+3)/4 FROM organization_recognition_nominees WHERE organization_id=? AND expires_at>?)
   AND NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM organization_recognition_nominees n WHERE n.id=j.value AND n.organization_id=? AND n.expires_at>?))
   ON CONFLICT(organization_id,user_id) DO UPDATE SET selections=excluded.selections,expires_at=excluded.expires_at`)
   .bind(org.id,user.id,json,expiry,json,org.id,now,json,org.id,now).run();
  if(!result.meta.changes)throw new HTTPException(409,{message:'Choose at most 25% of the current nominees, rounded up. Refresh if the nominee list changed.'});
  return c.json({saved:true});
 });
 app.delete('/:slug/five-over-five/nominees/:id',async c=>{
  const user=await auth(c.env,c.req.raw),org=await organization(c.env.DB,c.req.param('slug'));
  const result=await c.env.DB.prepare(`DELETE FROM organization_recognition_nominees WHERE id=? AND organization_id=? AND
   (submitted_by=? OR EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=? AND user_id=? AND status='active' AND role IN ('owner','administrator')))`)
   .bind(c.req.param('id'),org.id,user.id,org.id,user.id).run();
  if(!result.meta.changes)throw new HTTPException(404,{message:'Nomination not found or you do not have permission to remove it.'});return c.json({deleted:true});
 });
 app.delete('/:slug/five-over-five/ballot',async c=>{
  const user=await auth(c.env,c.req.raw),org=await organization(c.env.DB,c.req.param('slug'));
  await c.env.DB.prepare('DELETE FROM organization_recognition_ballots WHERE organization_id=? AND user_id=?').bind(org.id,user.id).run();return c.json({deleted:true});
 });
 return app;
}
