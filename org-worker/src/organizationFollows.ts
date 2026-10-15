import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

type FollowEnv = { DB: D1Database };
const upcoming = "(COALESCE(e.starts_at,e.event_date) IS NULL OR COALESCE(e.starts_at,e.event_date) >= date('now'))";

export function organizationFollowRoutes<Env extends FollowEnv>(
 auth: (env: Env, request: Request) => Promise<{ id: string }>,
 mapEvent: (env: Env, request: Request, row: any) => Promise<any>,
) {
 const app = new Hono<{ Bindings: Env }>();
 app.use('*', async (c,next) => { c.header('Cache-Control','no-store'); await next(); });
 async function organization(db: D1Database, id: string) {
  const org = await db.prepare('SELECT id FROM organizations WHERE id = ? OR slug = ? ORDER BY id = ? DESC LIMIT 1').bind(id,id,id).first<{id:string}>();
  if (!org) throw new HTTPException(404,{message:'Organization not found.'});
  return org.id;
 }
 app.get('/orgs/:id/follow', async c => {
  const user = await auth(c.env,c.req.raw), id = await organization(c.env.DB,c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT 1 FROM organization_follows WHERE user_id = ? AND organization_id = ?').bind(user.id,id).first();
  return c.json({following:!!row});
 });
 app.put('/orgs/:id/follow', async c => {
  const user = await auth(c.env,c.req.raw), id = await organization(c.env.DB,c.req.param('id'));
  await c.env.DB.prepare('INSERT OR IGNORE INTO organization_follows(user_id,organization_id) VALUES (?,?)').bind(user.id,id).run();
  return c.json({following:true});
 });
 app.delete('/orgs/:id/follow', async c => {
  const user = await auth(c.env,c.req.raw), id = await organization(c.env.DB,c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM organization_follows WHERE user_id = ? AND organization_id = ?').bind(user.id,id).run();
  return c.json({following:false});
 });
 app.get('/following/orgs', async c => {
  const user = await auth(c.env,c.req.raw);
  const rows = await c.env.DB.prepare(`SELECT o.id,o.name,o.slug,o.description,o.image_url,f.created_at AS followed_at
   FROM organization_follows f JOIN organizations o ON o.id = f.organization_id
   WHERE f.user_id = ? ORDER BY lower(o.name),o.id`).bind(user.id).all();
  return c.json(rows.results);
 });
 app.get('/following/events', async c => {
  const user = await auth(c.env,c.req.raw);
  const limit = Math.max(1,Math.min(parseInt(c.req.query('limit') || '200',10) || 200,200));
  const rows = await c.env.DB.prepare(`SELECT e.*,o.name AS organization_name,o.slug AS organization_slug,o.image_url AS organization_image_url
   FROM events e JOIN organization_follows f ON f.organization_id = e.host_org_id
   JOIN organizations o ON o.id = e.host_org_id WHERE f.user_id = ? AND ${upcoming}
   ORDER BY COALESCE(e.starts_at,e.event_date) IS NULL,COALESCE(e.starts_at,e.event_date),e.id LIMIT ?`).bind(user.id,limit).all();
  return c.json(await Promise.all(rows.results.map(row => mapEvent(c.env,c.req.raw,row))));
 });
 app.post('/notifications/:id/read', async c => {
  const user = await auth(c.env,c.req.raw);
  const row = await c.env.DB.prepare('SELECT id FROM user_notifications WHERE id = ? AND user_id = ?').bind(c.req.param('id'),user.id).first();
  if (!row) throw new HTTPException(404,{message:'Notification not found.'});
  await c.env.DB.prepare("UPDATE user_notifications SET status = 'read',read_at = ? WHERE id = ? AND user_id = ?").bind(new Date().toISOString(),c.req.param('id'),user.id).run();
  return c.json({ok:true});
 });
 return app;
}

// Retry-safe and bounded: five events and fifty recipients per event per minute.
// Followers must exist both at publication and delivery. No historic event backlog.
export async function dispatchFollowEventNotifications(db: D1Database) {
 await db.prepare(`DELETE FROM organization_follow_event_jobs WHERE event_id IN (
  SELECT j.event_id FROM organization_follow_event_jobs j LEFT JOIN events e ON e.id = j.event_id
  WHERE j.expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now') OR e.id IS NULL
   OR e.host_org_id IS NOT j.organization_id OR NOT ${upcoming} LIMIT 100)`).run();
 const jobs = await db.prepare(`SELECT j.*,e.slug,e.title,o.name FROM organization_follow_event_jobs j
  JOIN events e ON e.id = j.event_id JOIN organizations o ON o.id = j.organization_id
  ORDER BY j.created_at,j.event_id LIMIT 5`).all<{event_id:string;organization_id:string;created_at:string;last_user_id:string;slug:string;title:string;name:string}>();
 for (const job of jobs.results) {
  const followers = await db.prepare(`SELECT user_id FROM organization_follows
   WHERE organization_id = ? AND created_at <= ? AND user_id > ? ORDER BY user_id LIMIT 50`)
   .bind(job.organization_id,job.created_at,job.last_user_id).all<{user_id:string}>();
  const statements = await Promise.all(followers.results.map(async ({user_id}) => {
   const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([job.event_id,user_id])));
   const id = 'org-event-' + Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   return db.prepare(`INSERT OR IGNORE INTO user_notifications(id,user_id,type,entity_id,title,body,status,created_at)
    SELECT ?,?,'organization_event',e.slug,?,e.title,'unread',strftime('%Y-%m-%dT%H:%M:%fZ','now')
    FROM organization_follows f JOIN events e ON e.id = ?
    WHERE f.user_id = ? AND f.organization_id = ? AND f.created_at <= ?
     AND e.host_org_id = f.organization_id AND ${upcoming}`)
    .bind(id,user_id,`New event from ${job.name}`,job.event_id,user_id,job.organization_id,job.created_at);
  }));
  statements.push(followers.results.length < 50
   ? db.prepare('DELETE FROM organization_follow_event_jobs WHERE event_id = ?').bind(job.event_id)
   : db.prepare('UPDATE organization_follow_event_jobs SET last_user_id = max(last_user_id,?) WHERE event_id = ?')
    .bind(followers.results[followers.results.length-1].user_id,job.event_id));
  await db.batch(statements);
 }
}
