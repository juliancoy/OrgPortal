import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { resolvePortalTenant } from './timebank';
type Actor = { id: string };
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
  const rows=await c.env.DB.prepare('SELECT id,title,timezone,closed,created_at FROM availability_polls WHERE tenant_id = ? AND owner_user_id = ? ORDER BY created_at DESC LIMIT 100').bind(tenant.id,user.id).all();
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
  return c.json({id:p.id,title:p.title,timezone:p.timezone,slots:JSON.parse(p.slots_json),closed:!!p.closed,participants:rows.results?.length || 0,counts});
 });
 app.get('/:id/me',async c=>{
  const user=await getUser(c.env,c.req.raw),p=await poll(c.env,c.req.raw,c.req.param('id'));
  const row=await c.env.DB.prepare('SELECT slots_json FROM availability_responses WHERE poll_id = ? AND user_id = ?').bind(p.id,user.id).first<{slots_json:string}>();
  return c.json({slots:row?JSON.parse(row.slots_json):[],is_owner:p.owner_user_id===user.id});
 });
 app.put('/:id/me',async c=>{
  const user=await getUser(c.env,c.req.raw),p=await poll(c.env,c.req.raw,c.req.param('id'));
  const body=await c.req.json().catch(()=>null) as {slots?:unknown}|null;
  const slots=validateSelection(body?.slots,JSON.parse(p.slots_json));
  // The conditional write also prevents a response racing with poll closure.
  const result=await c.env.DB.prepare(`INSERT INTO availability_responses (poll_id,user_id,slots_json) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM availability_polls WHERE id = ? AND closed = 0)
   ON CONFLICT(poll_id,user_id) DO UPDATE SET slots_json=excluded.slots_json, updated_at=CURRENT_TIMESTAMP WHERE EXISTS (SELECT 1 FROM availability_polls WHERE id = ? AND closed = 0)`).bind(p.id,user.id,JSON.stringify(slots),p.id,p.id).run();
  if (!result.meta.changes) throw new HTTPException(409,{message:'This poll is closed.'});
  return c.json({ok:true});
 });
 app.patch('/:id',async c=>{
  const user=await getUser(c.env,c.req.raw),p=await poll(c.env,c.req.raw,c.req.param('id'));
  if(p.owner_user_id!==user.id) throw new HTTPException(403,{message:'Only the organizer can close or reopen this poll.'});
  const body=await c.req.json().catch(()=>null) as {closed?:unknown}|null;
  if(typeof body?.closed!=='boolean') reject('Choose closed or open.');
  await c.env.DB.prepare('UPDATE availability_polls SET closed = ? WHERE id = ? AND owner_user_id = ?').bind(body!.closed?1:0,p.id,user.id).run();
  return c.json({ok:true});
 });
 return app;
}
