import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authorizeOrganization, organizationRole, type OrganizationActor } from './organizationIam';

type PresentationEnv = { DB: D1Database };
export function presentationRoutes<E extends PresentationEnv>(auth: (env:E, request:Request)=>Promise<{id:string}>) {
 const app = new Hono<{Bindings:E}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next();});
 async function event(db:D1Database,id:string) {
  const row=await db.prepare('SELECT id,host_org_id,starts_at,ends_at FROM events WHERE id=?').bind(id).first<{id:string;host_org_id:string|null;starts_at:string|null;ends_at:string|null}>();
  if(!row || !row.host_org_id) throw new HTTPException(404,{message:'Hosted event not found'});
  return row;
 }
 async function manager(db:D1Database,user:{id:string},org:string) {
  await authorizeOrganization(db,{...user,name:user.id,email:null,isOperator:false} as OrganizationActor,'manage',org);
 }
 const active = "s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')";
 app.get('/:id/presentations/public',async c=>{
  const e=await event(c.env.DB,c.req.param('id'));
  const form=await c.env.DB.prepare('SELECT enabled FROM event_presentation_forms WHERE event_id=?').bind(e.id).first<{enabled:number}>();
  return c.json({enabled:!!form?.enabled,closed:!e.starts_at || Date.parse(e.starts_at)<=Date.now()});
 });
 app.put('/:id/presentations/form',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));await manager(c.env.DB,user,e.host_org_id!);
  const body=await c.req.json();if(typeof body.enabled!=='boolean')throw new HTTPException(400,{message:'enabled must be a boolean'});
  await c.env.DB.prepare('INSERT INTO event_presentation_forms(event_id,enabled) VALUES(?,?) ON CONFLICT(event_id) DO UPDATE SET enabled=excluded.enabled').bind(e.id,body.enabled?1:0).run();return c.json({enabled:body.enabled});
 });
 app.get('/:id/presentations',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));
  const role=await organizationRole(c.env.DB,e.host_org_id!,user.id),canReview=role==='owner'||role==='administrator';
  const rows=await c.env.DB.prepare(`SELECT s.*,o.name AS organization_name FROM event_presentation_submissions s JOIN organizations o ON o.id=s.organization_id WHERE s.event_id=? AND ${active} AND (?=1 OR EXISTS(SELECT 1 FROM organization_memberships m WHERE m.organization_id=s.organization_id AND m.user_id=? AND m.status='active' AND m.role IN ('owner','administrator'))) ORDER BY s.updated_at DESC LIMIT 200`).bind(e.id,canReview?1:0,user.id).all();
  return c.json({canReview,submissions:rows.results});
 });
 app.put('/:id/presentations/:org',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id')),org=c.req.param('org');await manager(c.env.DB,user,org);
  const body=await c.req.json();
  const title=typeof body.title==='string'?body.title.trim():'',summary=typeof body.summary==='string'?body.summary.trim():'';
  if(!title || title.length>200 || !summary || summary.length>5000) throw new HTTPException(400,{message:'A title (up to 200 characters) and summary (up to 5000 characters) are required'});
  // Recheck form/deadline and authority in the write to avoid closing/permission races.
  const result=await c.env.DB.prepare(`INSERT INTO event_presentation_submissions(event_id,organization_id,submitted_by,title,summary,status,updated_at,expires_at)
   SELECT e.id,?,?,?,?,'submitted',?,strftime('%Y-%m-%dT%H:%M:%fZ',COALESCE(e.ends_at,e.starts_at),'+90 days') FROM events e JOIN event_presentation_forms f ON f.event_id=e.id
   WHERE e.id=? AND f.enabled=1 AND julianday(e.starts_at)>julianday('now') AND EXISTS(SELECT 1 FROM organization_memberships m WHERE m.organization_id=? AND m.user_id=? AND m.status='active' AND m.role IN ('owner','administrator'))
   ON CONFLICT(event_id,organization_id) DO UPDATE SET title=excluded.title,summary=excluded.summary,status='submitted',submitted_by=excluded.submitted_by,updated_at=excluded.updated_at,expires_at=excluded.expires_at`).bind(org,user.id,title,summary,new Date().toISOString(),e.id,org,user.id).run();
  if(!result.meta.changes)throw new HTTPException(409,{message:'Applications are closed or team management access changed'});return c.json({status:'submitted'});
 });
 app.patch('/:id/presentations/:org',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));await manager(c.env.DB,user,e.host_org_id!);
  const {status}=await c.req.json();if(!['accepted','declined','submitted'].includes(status))throw new HTTPException(400,{message:'Invalid status'});
  const result=await c.env.DB.prepare(`UPDATE event_presentation_submissions AS s SET status=?,updated_at=? WHERE event_id=? AND organization_id=? AND ${active}`).bind(status,new Date().toISOString(),e.id,c.req.param('org')).run();
  if(!result.meta.changes)throw new HTTPException(404,{message:'Application not found'});return c.json({status});
 });
 app.delete('/:id/presentations/:org',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));await manager(c.env.DB,user,c.req.param('org'));
  await c.env.DB.prepare('DELETE FROM event_presentation_submissions WHERE event_id=? AND organization_id=?').bind(e.id,c.req.param('org')).run();return c.json({deleted:true});
 });
 return app;
}
