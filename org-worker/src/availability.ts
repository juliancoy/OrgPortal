import { onboardingEnabled, type OnboardingActor } from './onboarding';
import { accountSelection, saveAccountAvailability, type AvailabilityObservation } from './accountAvailability';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { resolvePortalTenant } from './timebank';
type Actor = OnboardingActor;
type Poll = { id: string; tenant_id: string; owner_user_id: string; title: string; timezone: string; slots_json: string; closed: number; created_at: string };
const reject = (message: string) => { throw new HTTPException(400, { message }); };
export function validatePoll(value: unknown) {
 const p = value as { title?: unknown; timezone?: unknown; slots?: unknown } | null;
 if (!p || typeof p.title !== 'string' || !p.title.trim() || p.title.length > 120) reject('Use a title of 1–120 characters.');
 if (typeof p!.timezone !== 'string') reject('Choose a timezone.');
 try { new Intl.DateTimeFormat('en', { timeZone: p!.timezone as string }); } catch { reject('Invalid timezone.'); }
 if (!Array.isArray(p!.slots) || !p!.slots.length || p!.slots.length > 672) reject('Choose 1–672 half-hour slots.');
 const slots = (p!.slots as unknown[]).map(s => {
  if (typeof s !== 'string' || !Number.isFinite(Date.parse(s)) || Date.parse(s) % 1800000 !== 0) reject('Slots must be valid half-hour instants.');
  return new Date(s as string).toISOString();
 }).sort();
 if (new Set(slots).size !== slots.length || Date.parse(slots.at(-1)!) - Date.parse(slots[0]) > 14 * 86400000) reject('Choose unique slots within a two-week period.');
 return { title: (p!.title as string).trim(), timezone: p!.timezone as string, slots };
}
export function validateSelection(value: unknown, allowed: string[]) {
 if (!Array.isArray(value) || value.length > allowed.length || value.some(s => typeof s !== 'string' || !allowed.includes(s)) || new Set(value).size !== value.length) reject('Availability contains an invalid slot.');
 return value as string[];
}
export function availabilityRoutes(getUser: (env: Env, request: Request) => Promise<Actor>) {
 const app = new Hono<{ Bindings: Env }>();
 app.use('*', async(c,next)=>{c.header('Cache-Control','no-store'); await next();});
 async function poll(env: Env, request: Request, id: string) {
  const tenant = await resolvePortalTenant(env.DB, request);
  const row = await env.DB.prepare('SELECT * FROM availability_polls WHERE id = ? AND tenant_id = ?').bind(id,tenant.id).first<Poll>();
  if (!row) throw new HTTPException(404,{message:'Poll not found.'});
  return row;
 }
 app.get('/',async c=>{
  const user=await getUser(c.env,c.req.raw), tenant=await resolvePortalTenant(c.env.DB,c.req.raw);
  const rows=await c.env.DB.prepare('SELECT id,title,timezone,closed,created_at FROM availability_polls WHERE tenant_id = ? AND (owner_user_id = ? OR EXISTS (SELECT 1 FROM availability_invites WHERE poll_id = availability_polls.id AND user_id = ?)) ORDER BY created_at DESC LIMIT 100').bind(tenant.id,user.id,user.id).all();
  return c.json({polls:rows.results});
 });
 app.post('/',async c=>{
  const user=await getUser(c.env,c.req.raw), tenant=await resolvePortalTenant(c.env.DB,c.req.raw);
  const p=validatePoll(await c.req.json().catch(()=>null));
  const id=crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO availability_polls (id,tenant_id,owner_user_id,title,timezone,slots_json) VALUES (?,?,?,?,?,?)').bind(id,tenant.id,user.id,p.title,p.timezone,JSON.stringify(p.slots)).run();
  return c.json({id},201);
 });
 app.get('/:id',async c=>{
  const p=await poll(c.env,c.req.raw,c.req.param('id'));
  const rows=await c.env.DB.prepare('SELECT slots_json FROM availability_responses WHERE poll_id = ?').bind(p.id).all<{slots_json:string}>();
  const counts: Record<string,number> = Object.fromEntries((JSON.parse(p.slots_json) as string[]).map(s=>[s,0]));
  for (const row of rows.results || []) for (const s of JSON.parse(row.slots_json) as string[]) if (s in counts) counts[s]++;
  const invited=await c.env.DB.prepare('SELECT count(*) AS n FROM availability_invites WHERE poll_id = ?').bind(p.id).first<{n:number}>();
  return c.json({invited_count:Number(invited?.n||0),access:'link',id:p.id,title:p.title,timezone:p.timezone,slots:JSON.parse(p.slots_json),closed:!!p.closed,participants:rows.results?.length || 0,counts});
 });
 app.get('/:id/me',async c=>{
  const user=await getUser(c.env,c.req.raw),p=await poll(c.env,c.req.raw,c.req.param('id'));
  const row=await c.env.DB.prepare('SELECT slots_json FROM availability_responses WHERE poll_id = ? AND user_id = ?').bind(p.id,user.id).first<{slots_json:string}>();
  const timezone=c.req.query('timezone') || p.timezone;
  try { new Intl.DateTimeFormat('en',{timeZone:timezone}); } catch { reject('Invalid timezone.'); }
  const pollSlots=JSON.parse(p.slots_json) as string[];
  const history=await c.env.DB.prepare('SELECT slot,available FROM account_availability WHERE user_id = ? AND slot <= ? ORDER BY slot').bind(user.id,new Date(Date.parse(pollSlots.at(-1)!)+7*86400000).toISOString()).all<AvailabilityObservation>();
  const selection=accountSelection(pollSlots,history.results,timezone);
  return c.json({...selection,has_response:!!row,is_owner:p.owner_user_id===user.id});
 });
 app.put('/:id/me',async c=>{
  const user=await getUser(c.env,c.req.raw),p=await poll(c.env,c.req.raw,c.req.param('id'));
  const tenant=await resolvePortalTenant(c.env.DB,c.req.raw);
  const body=await c.req.json().catch(()=>null) as {slots?:unknown}|null;
  const slots=validateSelection(body?.slots,JSON.parse(p.slots_json));
  // The conditional write also prevents a response racing with poll closure.
  const results=await c.env.DB.batch([c.env.DB.prepare(`INSERT INTO availability_responses (poll_id,user_id,slots_json) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM availability_polls WHERE id = ? AND closed = 0)
   ON CONFLICT(poll_id,user_id) DO UPDATE SET slots_json=excluded.slots_json, updated_at=CURRENT_TIMESTAMP WHERE EXISTS (SELECT 1 FROM availability_polls WHERE id = ? AND closed = 0)`).bind(p.id,user.id,JSON.stringify(slots),p.id,p.id),
   saveAccountAvailability(c.env.DB,user.id,JSON.parse(p.slots_json),slots,p.id),
   c.env.DB.prepare("UPDATE user_tasks SET status = 'completed',completed_at = COALESCE(completed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE tenant_id = ? AND user_id = ? AND kind = 'personal' AND entity_id LIKE 'availability-calendar:%' AND ? = 0 AND EXISTS (SELECT 1 FROM availability_responses r JOIN availability_polls p ON p.id = r.poll_id WHERE r.poll_id = ? AND r.user_id = ? AND p.closed = 0)").bind(p.tenant_id,user.id,onboardingEnabled(tenant)?1:0,p.id,user.id),
   c.env.DB.prepare("UPDATE user_tasks SET status = 'completed',completed_at = COALESCE(completed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE tenant_id = ? AND user_id = ? AND kind = 'availability' AND entity_id = ? AND EXISTS (SELECT 1 FROM availability_polls WHERE id = ? AND closed = 0) AND EXISTS (SELECT 1 FROM availability_responses WHERE poll_id = ? AND user_id = ?)").bind(p.tenant_id,user.id,p.id,p.id,p.id,user.id)
  ]);
  const result=results[0];
  if (!result.meta.changes) throw new HTTPException(409,{message:'This poll is closed.'});
  return c.json({ok:true});
 });
 app.patch('/:id',async c=>{
  const user=await getUser(c.env,c.req.raw),p=await poll(c.env,c.req.raw,c.req.param('id'));
  if(p.owner_user_id!==user.id) throw new HTTPException(403,{message:'Only the organizer can close or reopen this poll.'});
  const body=await c.req.json().catch(()=>null) as {closed?:unknown}|null;
  if(typeof body?.closed!=='boolean') reject('Choose closed or open.');
  await c.env.DB.batch([
   c.env.DB.prepare('UPDATE availability_polls SET closed = ? WHERE id = ? AND owner_user_id = ?').bind(body!.closed?1:0,p.id,user.id),
   c.env.DB.prepare(`UPDATE user_tasks SET status = CASE WHEN ? = 1 OR EXISTS (SELECT 1 FROM availability_responses WHERE poll_id = ? AND user_id = user_tasks.user_id) THEN 'completed' ELSE 'pending' END,completed_at = CASE WHEN ? = 1 OR EXISTS (SELECT 1 FROM availability_responses WHERE poll_id = ? AND user_id = user_tasks.user_id) THEN COALESCE(completed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE NULL END WHERE tenant_id = ? AND kind = 'availability' AND entity_id = ?`).bind(body!.closed?1:0,p.id,body!.closed?1:0,p.id,p.tenant_id,p.id)
  ]);
  return c.json({ok:true});
 });
 app.get('/:id/invites',async c=>{
  const user=await getUser(c.env,c.req.raw),p=await poll(c.env,c.req.raw,c.req.param('id'));
  if(p.owner_user_id!==user.id)throw new HTTPException(403,{message:'Only the organizer can view invitations.'});
  const rows=await c.env.DB.prepare(`SELECT i.user_id,COALESCE(u.user_name,'Portal member') AS user_name,EXISTS (SELECT 1 FROM availability_responses r WHERE r.poll_id = i.poll_id AND r.user_id = i.user_id) AS responded FROM availability_invites i LEFT JOIN user_contact_pages u ON u.user_id = i.user_id WHERE i.poll_id = ? ORDER BY i.created_at,i.user_id`).bind(p.id).all();
  return c.json({invites:rows.results||[]});
 });
 app.post('/:id/invites',async c=>{
  const user=await getUser(c.env,c.req.raw),p=await poll(c.env,c.req.raw,c.req.param('id'));
  if(p.owner_user_id!==user.id)throw new HTTPException(403,{message:'Only the organizer can invite people.'});
  if(p.closed)throw new HTTPException(409,{message:'Reopen this poll before inviting people.'});
  const body=await c.req.json().catch(()=>null) as {user_ids?:unknown}|null;
  if(!Array.isArray(body?.user_ids)||!body.user_ids.length||body.user_ids.length>50||body.user_ids.some(id=>typeof id!=='string'||!id||id.length>200))reject('Choose 1–50 portal members.');
  const ids=[...new Set(body!.user_ids as string[])];
  const rows=await c.env.DB.prepare(`SELECT user_id FROM user_contact_pages WHERE user_id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all<{user_id:string}>();
  if(rows.results.length!==ids.length)reject('One or more selected members no longer exist.');
  const statements=ids.flatMap(id=>[
   c.env.DB.prepare('INSERT INTO availability_invites (poll_id,user_id,invited_by_user_id) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM availability_polls WHERE id = ? AND closed = 0) ON CONFLICT(poll_id,user_id) DO NOTHING').bind(p.id,id,user.id,p.id),
   c.env.DB.prepare(`INSERT INTO user_tasks (id,tenant_id,user_id,created_by_user_id,kind,entity_id,title,status,completed_at) SELECT ?,?,?,?,'availability',?, ?,CASE WHEN EXISTS (SELECT 1 FROM availability_responses WHERE poll_id = ? AND user_id = ?) THEN 'completed' ELSE 'pending' END,CASE WHEN EXISTS (SELECT 1 FROM availability_responses WHERE poll_id = ? AND user_id = ?) THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END WHERE EXISTS (SELECT 1 FROM availability_polls WHERE id = ? AND closed = 0) ON CONFLICT(tenant_id,user_id,kind,entity_id) DO NOTHING`).bind(crypto.randomUUID(),p.tenant_id,id,user.id,p.id,`Respond to ${p.title}`,p.id,id,p.id,id,p.id)
  ]);
  await c.env.DB.batch(statements);
  const latest=await poll(c.env,c.req.raw,p.id);if(latest.closed)throw new HTTPException(409,{message:'This poll is closed.'});
  return c.json({ok:true});
 });
 return app;
}
