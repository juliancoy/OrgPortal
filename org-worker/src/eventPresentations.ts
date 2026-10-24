import { guestPresentationRoutes } from './guestPresentations';
import type { GuestPresentationActor, GuestPresentationEnv } from './guestPresentationAccounts';
import { submissionPresenters, validateSubmissionPresenters } from './submissionPresenters'
import { presentationFinalRoundRoutes } from './presentationFinalRound'
import { presentationAttachmentRoutes, publicAttachment } from './presentationAttachments'
import { stream } from 'hono/streaming';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authorizeOrganization, organizationRole, type OrganizationActor } from './organizationIam';

type PresentationEnv = GuestPresentationEnv & { SCAN_IMAGES?: R2Bucket };
export function presentationRoutes<E extends PresentationEnv>(auth: (env:E, request:Request)=>Promise<GuestPresentationActor>) {
 const app = new Hono<{Bindings:E}>();
 app.route('/',guestPresentationRoutes(auth));
 app.route('/',presentationAttachmentRoutes(auth));
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next();});
 app.route('/',presentationFinalRoundRoutes(auth));
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
  const rows=await c.env.DB.prepare(`SELECT s.submission_id,s.organization_id,o.name AS organization_name,o.slug AS organization_slug,o.image_url,s.title,s.summary,s.status,
   (SELECT COUNT(*) FROM event_submission_favorites f WHERE f.event_id=s.event_id AND f.submission_id=s.submission_id AND f.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS favorites
   FROM event_submissions s JOIN organizations o ON o.id=s.organization_id
   WHERE s.event_id=? AND ${active} AND s.submission_id>? ORDER BY s.submission_id LIMIT 51`).bind(e.id,after).all<{submission_id:string;organization_id:string}>();
  const settings=await c.env.DB.prepare('SELECT favorite_limit FROM event_presentation_forms WHERE event_id=?').bind(e.id).first<{favorite_limit:number}>();
  const page=rows.results.slice(0,50);
  const attachments=page.length?await c.env.DB.prepare(`SELECT id,submission_id,name,content_type,size FROM event_presentation_attachments WHERE event_id=? AND state='ready' AND submission_id IN (${page.map(()=>'?').join(',')})`).bind(e.id,...page.map(row=>row.submission_id)).all<{id:string;submission_id:string;name:string;content_type:string;size:number}>():{results:[]};
  const presenters=await submissionPresenters(c.env.DB,e.id,page.map(row=>row.submission_id));
  return c.json({favoriteLimit:settings?.favorite_limit??3,submissions:page.map(row=>({...row,presenters:presenters.get(row.submission_id)||[],attachments:attachments.results.filter(file=>file.submission_id===row.submission_id).map(publicAttachment)})),next:rows.results.length>50?rows.results[49].submission_id:null});
 });
 app.get('/:id/presentations/team/:org',async c=>{
  const user=await auth(c.env,c.req.raw);await event(c.env.DB,c.req.param('id'));
  const org=c.req.param('org');await manager(c.env.DB,user,org);
  const members=await c.env.DB.prepare(`SELECT m.user_id AS userId,COALESCE(m.user_name,'Team member') AS name,u.photo_url AS photo FROM organization_memberships m LEFT JOIN user_contact_pages u ON u.user_id=m.user_id AND u.enabled=1 WHERE m.organization_id=? AND m.status='active' ORDER BY m.created_at,m.user_id`).bind(org).all();
  const invitations=await c.env.DB.prepare("SELECT id AS invitationId,email,email AS name FROM organization_invitations WHERE organization_id=? AND purpose='member' AND status='pending' AND expires_at>? ORDER BY created_at,id").bind(org,Date.now()).all();
  return c.json({people:[...members.results.map(({photo,...member})=>({...member,...(typeof photo==='string'?{photo}: {})})),...invitations.results]});
 });
 app.get('/:id/presentations/favorites',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));
  const rows=await c.env.DB.prepare(`SELECT f.submission_id FROM event_submission_favorites f JOIN event_submissions s ON s.event_id=f.event_id AND s.submission_id=f.submission_id WHERE f.event_id=? AND f.user_id=? AND ${active} AND f.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') ORDER BY f.slot`).bind(e.id,user.id).all<{submission_id:string;organization_id:string}>();
  const settings=await c.env.DB.prepare('SELECT favorite_limit FROM event_presentation_forms WHERE event_id=?').bind(e.id).first<{favorite_limit:number}>();
  return c.json({favorites:rows.results.map(row=>row.submission_id),limit:settings?.favorite_limit??3});
 });
 app.put('/:id/presentations/favorites/:org',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id')),org=c.req.param('org');
  const body=await c.req.json().catch(()=>null);
  if(!body||typeof body.selected!=='boolean'||Object.keys(body).some(key=>key!=='selected'))throw new HTTPException(400,{message:'selected must be a boolean'});
  if(!body.selected){await c.env.DB.batch([c.env.DB.prepare('DELETE FROM event_presentation_favorites WHERE event_id=? AND user_id=? AND organization_id=?').bind(e.id,user.id,org),c.env.DB.prepare('DELETE FROM event_submission_favorites WHERE event_id=? AND user_id=? AND submission_id=?').bind(e.id,user.id,org)]);return c.json({saved:true})}
  // Select a free slot within the live event limit in the same atomic write.
  await c.env.DB.batch([
   c.env.DB.prepare("DELETE FROM event_submission_favorites WHERE event_id=? AND user_id=? AND expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(e.id,user.id),
   c.env.DB.prepare(`INSERT OR IGNORE INTO event_submission_favorites(event_id,user_id,slot,submission_id,created_at,expires_at)
    SELECT s.event_id,?,slots.slot,s.submission_id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),s.expires_at
    FROM event_submissions s CROSS JOIN (WITH RECURSIVE slots(slot) AS (SELECT 1 UNION ALL SELECT slot+1 FROM slots WHERE slot<100) SELECT slot FROM slots) slots
    WHERE s.event_id=? AND s.submission_id=? AND ${active}
    AND slots.slot<=COALESCE((SELECT favorite_limit FROM event_presentation_forms WHERE event_id=s.event_id),3)
    AND (SELECT COUNT(*) FROM event_submission_favorites f WHERE f.event_id=s.event_id AND f.user_id=?)<COALESCE((SELECT favorite_limit FROM event_presentation_forms WHERE event_id=s.event_id),3)
    AND NOT EXISTS(SELECT 1 FROM event_submission_favorites f WHERE f.event_id=s.event_id AND f.user_id=? AND f.slot=slots.slot)
    ORDER BY slots.slot LIMIT 1`).bind(user.id,e.id,org,user.id,user.id)
  ]);
  const saved=await c.env.DB.prepare('SELECT 1 AS saved FROM event_submission_favorites WHERE event_id=? AND user_id=? AND submission_id=?').bind(e.id,user.id,org).first();
  if(!saved)throw new HTTPException(409,{message:'The event favorite limit has been reached. Remove a favorite first, or refresh if the submission is no longer available.'});
  return c.json({saved:true});
 });
 app.put('/:id/presentations/settings',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));await manager(c.env.DB,user,e.host_org_id!);
  const body=await c.req.json().catch(()=>null),limit=body?.favoriteLimit;
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new HTTPException(400,{message:'Choose a favorite limit between 1 and 100'});
  // A limit change never discards choices or makes a saved ballot invalid.
  const result=await c.env.DB.prepare(`INSERT INTO event_presentation_forms(event_id,enabled,favorite_limit)
   SELECT ?,0,? WHERE ?>=COALESCE((SELECT MAX(n) FROM (SELECT COUNT(*) AS n FROM event_submission_favorites f JOIN event_submissions s ON s.event_id=f.event_id AND s.submission_id=f.submission_id WHERE f.event_id=? AND ${active} AND f.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') GROUP BY f.user_id)),0)
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
  const rows=await c.env.DB.prepare(`SELECT s.*,o.name AS organization_name FROM event_submissions s JOIN organizations o ON o.id=s.organization_id WHERE s.event_id=? AND ${active} AND (?=1 OR EXISTS(SELECT 1 FROM organization_memberships m WHERE m.organization_id=s.organization_id AND m.user_id=? AND m.status='active' AND m.role IN ('owner','administrator'))) ORDER BY s.updated_at DESC LIMIT 200`).bind(e.id,canReview?1:0,user.id).all<{submission_id:string}>();
  const presenters=await submissionPresenters(c.env.DB,e.id,rows.results.map(row=>row.submission_id),true);
  return c.json({canReview,submissions:rows.results.map(row=>({...row,presenters:presenters.get(row.submission_id)||[]}))});
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
  const grouped=await c.env.DB.prepare(`SELECT status,COUNT(*) AS n FROM event_submissions s WHERE event_id=? AND ${active} GROUP BY status`).bind(e.id).all<{status:string;n:number}>();
  const counts={all:0,submitted:0,accepted:0,declined:0};
  for(const row of grouped.results){if(row.status in counts&&row.status!=='all'){counts[row.status as keyof typeof counts]=Number(row.n);counts.all+=Number(row.n)}}
  const total=counts[status as keyof typeof counts],pages=Math.max(1,Math.ceil(total/pageSize)),currentPage=Math.min(page,pages);
  const rows=await c.env.DB.prepare(`SELECT s.*,o.name AS organization_name FROM event_submissions s JOIN organizations o ON o.id=s.organization_id WHERE s.event_id=? AND ${active} AND (?='all' OR s.status=?) ORDER BY s.updated_at DESC,s.submission_id ASC LIMIT ? OFFSET ?`).bind(e.id,status,status,pageSize,(currentPage-1)*pageSize).all<{submission_id:string}>();
  const presenters=await submissionPresenters(c.env.DB,e.id,rows.results.map(row=>row.submission_id),true);
  return c.json({submissions:rows.results.map(row=>({...row,presenters:presenters.get(row.submission_id)||[]})),counts,total,page:currentPage,pageSize,pages});
 });
 app.get('/:id/presentations/export',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));await manager(c.env.DB,user,e.host_org_id!);
  const status=statusFilter(c.req.query('status'));
  c.header('Content-Type','text/csv; charset=utf-8');c.header('Content-Disposition','attachment; filename="event-applications.csv"');
  // Keyset batches avoid truncating exports and keep worker memory bounded.
  return stream(c,async output=>{
   const keys=['submission_id','organization_name','organization_id','title','summary','presenters','status','submitted_by','updated_at'];
   await output.write('\uFEFF'+keys.join(',')+'\r\n');let after='';
   while(!output.aborted){
    await manager(c.env.DB,user,e.host_org_id!);
    const rows=await c.env.DB.prepare(`SELECT s.*,o.name AS organization_name FROM event_submissions s JOIN organizations o ON o.id=s.organization_id WHERE s.event_id=? AND ${active} AND (?='all' OR s.status=?) AND s.submission_id>? ORDER BY s.submission_id LIMIT 100`).bind(e.id,status,status,after).all<Record<string,unknown>>();
    const presenters=await submissionPresenters(c.env.DB,e.id,rows.results.map(row=>String(row.submission_id)),true);
    for(const row of rows.results){row.presenters=(presenters.get(String(row.submission_id))||[]).map(person=>person.name).join('; ');await output.write(keys.map(key=>applicationCsvCell(row[key])).join(',')+'\r\n')}
    if(rows.results.length<100)break;
    after=String(rows.results[rows.results.length-1].submission_id);
   }
  },async(_error,output)=>{output.abort()});
 });
 // PUT uses a client-generated ID, making creation and attachment retries idempotent.
 app.put('/:id/presentations/:submission',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id')),id=c.req.param('submission');
  const existing=await c.env.DB.prepare('SELECT organization_id,presenters_json FROM event_submissions WHERE event_id=? AND submission_id=?').bind(e.id,id).first<{organization_id:string;presenters_json:string}>();
  const body=await c.req.json(),org=existing?.organization_id || body.organization_id || id;
  if(typeof org!=='string'||id.length>255)throw new HTTPException(400,{message:'Invalid submission or team'});
  if(!existing&&body.organization_id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new HTTPException(400,{message:'A valid submission identifier is required'});
  await manager(c.env.DB,user,org);
  const title=typeof body.title==='string'?body.title.trim():'',summary=typeof body.summary==='string'?body.summary.trim():'';
  if(!title || title.length>200 || !summary || summary.length>5000) throw new HTTPException(400,{message:'A title (up to 200 characters) and summary (up to 5000 characters) are required'});
  const presenters=await validateSubmissionPresenters(c.env.DB,org,body.presenters===undefined?[{userId:user.id}]:body.presenters);
  // New applications require open intake. Existing applications remain editable
  // until expiry, with live team authority checked in the write itself.
  const savedAt=new Date().toISOString();
  const submissionWrite=c.env.DB.prepare(`INSERT INTO event_submissions(event_id,submission_id,organization_id,submitted_by,title,summary,status,updated_at,expires_at,presenters_json)
   SELECT e.id,?,?,?,?,?,'submitted',?,strftime('%Y-%m-%dT%H:%M:%fZ',COALESCE(e.ends_at,e.starts_at),'+90 days'),? FROM events e
   WHERE e.id=? AND (EXISTS(SELECT 1 FROM event_submissions s WHERE s.event_id=e.id AND s.submission_id=? AND s.organization_id=? AND ${active}) OR EXISTS(SELECT 1 FROM event_presentation_forms f WHERE f.event_id=e.id AND f.enabled=1 AND julianday(e.starts_at)>julianday('now')))
   AND EXISTS(SELECT 1 FROM organization_memberships m WHERE m.organization_id=? AND m.user_id=? AND m.status='active' AND m.role IN ('owner','administrator'))
   ON CONFLICT(event_id,submission_id) DO UPDATE SET title=excluded.title,summary=excluded.summary,status='submitted',updated_at=excluded.updated_at,presenters_json=excluded.presenters_json
   WHERE event_submissions.organization_id=excluded.organization_id AND event_submissions.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(id,org,user.id,title,summary,savedAt,presenters,e.id,id,org,org,user.id);
  const publicUrl=new URL(`/events/${encodeURIComponent((await c.env.DB.prepare('SELECT slug FROM events WHERE id=?').bind(e.id).first<{slug:string}>())!.slug)}#submissions`,new URL(c.req.url).hostname==='internal.invalid' ? c.env.PUBLIC_PORTAL_BASE_URL || 'https://orgportal.cc' : c.req.url).href;
  const [result]=await c.env.DB.batch([submissionWrite,c.env.DB.prepare(`INSERT INTO organization_support_records
   (id,from_organization_id,to_organization_id,from_label,to_label,support_kind,description,occurred_at,source_url,evidence,notes,provenance_json,status,created_at)
   SELECT ?,o.id,h.id,o.name,h.name,'in_kind','Proposed presentation contribution',COALESCE(e.starts_at,''),?,
    'Presentation application submitted by the contributing organization.','Proposed service only; acceptance and delivery are not asserted.',?,'reported',?
   FROM event_submissions s JOIN events e ON e.id=s.event_id JOIN organizations o ON o.id=s.organization_id JOIN organizations h ON h.id=e.host_org_id
   WHERE s.event_id=? AND s.submission_id=? AND s.updated_at=? AND o.id!=h.id
   ON CONFLICT(id) DO UPDATE SET status='reported',void_reason=NULL,occurred_at=excluded.occurred_at,source_url=excluded.source_url,provenance_json=excluded.provenance_json`)
   .bind(`presentation:${e.id}:${id}`,publicUrl,JSON.stringify([{source:'Presentation application',eventId:e.id,submissionId:id,eventUrl:publicUrl}]),savedAt,e.id,id,savedAt)]);
  if(!result.meta.changes)throw new HTTPException(409,{message:'Applications are closed, this submission has expired, or team management access changed'});
  // Keep the temporary rollout copy consistent when editing a migrated entry.
  if(id===org)await c.env.DB.prepare("UPDATE event_presentation_submissions SET title=?,summary=?,status='submitted',updated_at=? WHERE event_id=? AND organization_id=?").bind(title,summary,new Date().toISOString(),e.id,org).run();
  return c.json({submission_id:id,status:'submitted'});
 });
 app.patch('/:id/presentations/:org',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));await manager(c.env.DB,user,e.host_org_id!);
  const {status}=await c.req.json();if(!['accepted','declined','submitted'].includes(status))throw new HTTPException(400,{message:'Invalid status'});
  const result=await c.env.DB.prepare(`UPDATE event_submissions AS s SET status=?,updated_at=? WHERE event_id=? AND submission_id=? AND ${active}`).bind(status,new Date().toISOString(),e.id,c.req.param('org')).run();
  if(!result.meta.changes)throw new HTTPException(404,{message:'Application not found'});
  await c.env.DB.prepare("UPDATE organization_support_records SET status=?,void_reason=? WHERE id=?").bind(status==='declined'?'voided':'reported',status==='declined'?'Presentation application declined':null,`presentation:${e.id}:${c.req.param('org')}`).run();
  return c.json({status});
 });
 app.delete('/:id/presentations/:org',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));const row=await c.env.DB.prepare('SELECT organization_id FROM event_submissions WHERE event_id=? AND submission_id=?').bind(e.id,c.req.param('org')).first<{organization_id:string}>();if(!row)throw new HTTPException(404,{message:'Application not found'});await manager(c.env.DB,user,row.organization_id);
  await c.env.DB.batch([c.env.DB.prepare("UPDATE organization_support_records SET status='voided',void_reason='Presentation application withdrawn' WHERE id=?").bind(`presentation:${e.id}:${c.req.param('org')}`),c.env.DB.prepare('DELETE FROM event_presentation_submissions WHERE event_id=? AND organization_id=? AND organization_id=?').bind(e.id,c.req.param('org'),row.organization_id),c.env.DB.prepare('DELETE FROM event_submissions WHERE event_id=? AND submission_id=?').bind(e.id,c.req.param('org'))]);return c.json({deleted:true});
 });
 return app;
}

// Quote every field and neutralize spreadsheet formulas, including leading whitespace.
export function applicationCsvCell(value:unknown) {
 const text=String(value??''),safe=/^[\s\uFEFF]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text)?"'"+text:text;
 return '"'+safe.replace(/"/g,'""')+'"';
}
