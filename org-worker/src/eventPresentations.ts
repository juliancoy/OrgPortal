import { stream } from 'hono/streaming';
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
  const form=await c.env.DB.prepare('SELECT enabled,favorite_limit FROM event_presentation_forms WHERE event_id=?').bind(e.id).first<{enabled:number;favorite_limit:number}>();
  return c.json({favoriteLimit:form?.favorite_limit??3,enabled:!!form?.enabled,closed:!e.starts_at || Date.parse(e.starts_at)<=Date.now()});
 });
 // Public projection deliberately omits submitter identities and application timestamps.
 app.get('/:id/presentations/submissions',async c=>{
  const e=await event(c.env.DB,c.req.param('id')),after=c.req.query('after')||'';
  if(after.length>255)throw new HTTPException(400,{message:'Invalid cursor'});
  const rows=await c.env.DB.prepare(`SELECT s.organization_id,o.name AS organization_name,o.slug AS organization_slug,o.image_url,s.title,s.summary,s.status,
   (SELECT COUNT(*) FROM event_presentation_favorites f WHERE f.event_id=s.event_id AND f.organization_id=s.organization_id AND f.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS favorites
   FROM event_presentation_submissions s JOIN organizations o ON o.id=s.organization_id
   WHERE s.event_id=? AND ${active} AND s.organization_id>? ORDER BY s.organization_id LIMIT 51`).bind(e.id,after).all<{organization_id:string}>();
  const settings=await c.env.DB.prepare('SELECT favorite_limit FROM event_presentation_forms WHERE event_id=?').bind(e.id).first<{favorite_limit:number}>();
  return c.json({favoriteLimit:settings?.favorite_limit??3,submissions:rows.results.slice(0,50),next:rows.results.length>50?rows.results[49].organization_id:null});
 });
 app.get('/:id/presentations/favorites',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));
  const rows=await c.env.DB.prepare(`SELECT f.organization_id FROM event_presentation_favorites f JOIN event_presentation_submissions s ON s.event_id=f.event_id AND s.organization_id=f.organization_id WHERE f.event_id=? AND f.user_id=? AND ${active} AND f.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') ORDER BY f.slot`).bind(e.id,user.id).all<{organization_id:string}>();
  const settings=await c.env.DB.prepare('SELECT favorite_limit FROM event_presentation_forms WHERE event_id=?').bind(e.id).first<{favorite_limit:number}>();
  return c.json({favorites:rows.results.map(row=>row.organization_id),limit:settings?.favorite_limit??3});
 });
 app.put('/:id/presentations/favorites/:org',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id')),org=c.req.param('org');
  const body=await c.req.json().catch(()=>null);
  if(!body||typeof body.selected!=='boolean'||Object.keys(body).some(key=>key!=='selected'))throw new HTTPException(400,{message:'selected must be a boolean'});
  if(!body.selected){await c.env.DB.prepare('DELETE FROM event_presentation_favorites WHERE event_id=? AND user_id=? AND organization_id=?').bind(e.id,user.id,org).run();return c.json({saved:true})}
  // Select a free slot within the live event limit in the same atomic write.
  await c.env.DB.batch([
   c.env.DB.prepare("DELETE FROM event_presentation_favorites WHERE event_id=? AND user_id=? AND expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(e.id,user.id),
   c.env.DB.prepare(`INSERT OR IGNORE INTO event_presentation_favorites(event_id,user_id,slot,organization_id,created_at,expires_at)
    SELECT s.event_id,?,slots.slot,s.organization_id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),s.expires_at
    FROM event_presentation_submissions s CROSS JOIN (WITH RECURSIVE slots(slot) AS (SELECT 1 UNION ALL SELECT slot+1 FROM slots WHERE slot<100) SELECT slot FROM slots) slots
    WHERE s.event_id=? AND s.organization_id=? AND ${active}
    AND slots.slot<=COALESCE((SELECT favorite_limit FROM event_presentation_forms WHERE event_id=s.event_id),3)
    AND (SELECT COUNT(*) FROM event_presentation_favorites f WHERE f.event_id=s.event_id AND f.user_id=?)<COALESCE((SELECT favorite_limit FROM event_presentation_forms WHERE event_id=s.event_id),3)
    AND NOT EXISTS(SELECT 1 FROM event_presentation_favorites f WHERE f.event_id=s.event_id AND f.user_id=? AND f.slot=slots.slot)
    ORDER BY slots.slot LIMIT 1`).bind(user.id,e.id,org,user.id,user.id)
  ]);
  const saved=await c.env.DB.prepare('SELECT 1 AS saved FROM event_presentation_favorites WHERE event_id=? AND user_id=? AND organization_id=?').bind(e.id,user.id,org).first();
  if(!saved)throw new HTTPException(409,{message:'The event favorite limit has been reached. Remove a favorite first, or refresh if the submission is no longer available.'});
  return c.json({saved:true});
 });
 app.put('/:id/presentations/settings',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));await manager(c.env.DB,user,e.host_org_id!);
  const body=await c.req.json().catch(()=>null),limit=body?.favoriteLimit;
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new HTTPException(400,{message:'Choose a favorite limit between 1 and 100'});
  // A limit change never discards choices or makes a saved ballot invalid.
  const result=await c.env.DB.prepare(`INSERT INTO event_presentation_forms(event_id,enabled,favorite_limit)
   SELECT ?,0,? WHERE ?>=COALESCE((SELECT MAX(n) FROM (SELECT COUNT(*) AS n FROM event_presentation_favorites f JOIN event_presentation_submissions s ON s.event_id=f.event_id AND s.organization_id=f.organization_id WHERE f.event_id=? AND ${active} AND f.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') GROUP BY f.user_id)),0)
   ON CONFLICT(event_id) DO UPDATE SET favorite_limit=excluded.favorite_limit`).bind(e.id,limit,limit,e.id).run();
  if(!result.meta.changes)throw new HTTPException(409,{message:'The limit cannot be lower than an existing ballot. Existing favorites were preserved.'});
  return c.json({favoriteLimit:limit});
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
 // Manager review is independently authorized; applicant views remain team-scoped.
 function statusFilter(value:string|undefined) {
  const status=value||'all';
  if(!['all','submitted','accepted','declined'].includes(status))throw new HTTPException(400,{message:'Invalid application status filter'});
  return status;
 }
 app.get('/:id/presentations/review',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));await manager(c.env.DB,user,e.host_org_id!);
  const status=statusFilter(c.req.query('status')),page=Number(c.req.query('page')||1),pageSize=25;
  if(!Number.isSafeInteger(page)||page<1||page>1000000)throw new HTTPException(400,{message:'Invalid page'});
  const grouped=await c.env.DB.prepare(`SELECT status,COUNT(*) AS n FROM event_presentation_submissions s WHERE event_id=? AND ${active} GROUP BY status`).bind(e.id).all<{status:string;n:number}>();
  const counts={all:0,submitted:0,accepted:0,declined:0};
  for(const row of grouped.results){if(row.status in counts&&row.status!=='all'){counts[row.status as keyof typeof counts]=Number(row.n);counts.all+=Number(row.n)}}
  const total=counts[status as keyof typeof counts],pages=Math.max(1,Math.ceil(total/pageSize)),currentPage=Math.min(page,pages);
  const rows=await c.env.DB.prepare(`SELECT s.*,o.name AS organization_name FROM event_presentation_submissions s JOIN organizations o ON o.id=s.organization_id WHERE s.event_id=? AND ${active} AND (?='all' OR s.status=?) ORDER BY s.updated_at DESC,s.organization_id ASC LIMIT ? OFFSET ?`).bind(e.id,status,status,pageSize,(currentPage-1)*pageSize).all();
  return c.json({submissions:rows.results,counts,total,page:currentPage,pageSize,pages});
 });
 app.get('/:id/presentations/export',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));await manager(c.env.DB,user,e.host_org_id!);
  const status=statusFilter(c.req.query('status'));
  c.header('Content-Type','text/csv; charset=utf-8');c.header('Content-Disposition','attachment; filename="event-applications.csv"');
  // Keyset batches avoid truncating exports and keep worker memory bounded.
  return stream(c,async output=>{
   const keys=['organization_name','organization_id','title','summary','status','submitted_by','updated_at'];
   await output.write('\uFEFF'+keys.join(',')+'\r\n');let after='';
   while(!output.aborted){
    await manager(c.env.DB,user,e.host_org_id!);
    const rows=await c.env.DB.prepare(`SELECT s.*,o.name AS organization_name FROM event_presentation_submissions s JOIN organizations o ON o.id=s.organization_id WHERE s.event_id=? AND ${active} AND (?='all' OR s.status=?) AND s.organization_id>? ORDER BY s.organization_id LIMIT 100`).bind(e.id,status,status,after).all<Record<string,unknown>>();
    for(const row of rows.results)await output.write(keys.map(key=>applicationCsvCell(row[key])).join(',')+'\r\n');
    if(rows.results.length<100)break;
    after=String(rows.results[rows.results.length-1].organization_id);
   }
  },async(_error,output)=>{output.abort()});
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

// Quote every field and neutralize spreadsheet formulas, including leading whitespace.
export function applicationCsvCell(value:unknown) {
 const text=String(value??''),safe=/^[\s\uFEFF]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text)?"'"+text:text;
 return '"'+safe.replace(/"/g,'""')+'"';
}
