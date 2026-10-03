import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { resolvePortalTenant, type PortalTenant } from './timebank';
import { accountSelection, type AvailabilityObservation } from './accountAvailability';

export const onboardingSteps = [
 { id: 'constitution', title: 'Read the Constitution and bylaws', description: 'Review the linked document, currently marked as an unratified draft. Bring questions to an organizer.', href: 'https://codecollective.us/constitution' },
 { id: 'participation', title: 'Choose how to participate', description: 'Introduce yourself and discuss a team or volunteer role with an organizer. The document describes team participation as a route to membership.', href: '/chat' },
 { id: 'communications', title: 'Review communications and conduct', description: 'Learn the community channels, expectations for respectful conduct, and how to raise concerns with organizers.', href: 'https://codecollective.us/constitution' },
 { id: 'meetings', title: 'Learn meetings and governance', description: 'Review meeting types and the motion, seconding, and voting process. Find an upcoming meeting to attend.', href: '/events' },
] as const;
type Enrollment = { start_date: string; end_date: string; acknowledgements: string; availability_saved_at: string | null; completed_at: string | null };
export function onboardingEnabled(tenant: PortalTenant) {
 try { return JSON.parse(tenant.feature_config || '{}').onboarding?.enabled === true; } catch { return false; }
}
export function nextMonth(date: string) {
 const d = new Date(`${date}T00:00:00Z`), day = d.getUTCDate();
 d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 2); d.setUTCDate(0);
 d.setUTCDate(Math.min(day, d.getUTCDate()));
 return d.toISOString().slice(0, 10);
}
export async function ensureOnboarding(db: D1Database, tenant: PortalTenant, userId: string) {
 if (!onboardingEnabled(tenant)) return null;
 const start = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
 await db.batch([
  db.prepare('INSERT INTO onboarding_enrollments (tenant_id,user_id,start_date,end_date) VALUES (?,?,?,?) ON CONFLICT DO NOTHING').bind(tenant.id,userId,start,nextMonth(start)),
  db.prepare("INSERT INTO user_tasks (id,tenant_id,user_id,created_by_user_id,kind,entity_id,title) VALUES (?,?,?,?,'personal','onboarding:v1',?) ON CONFLICT(tenant_id,user_id,kind,entity_id) DO NOTHING").bind(crypto.randomUUID(),tenant.id,userId,userId,`Complete ${tenant.name} onboarding`),
 ]);
 return db.prepare('SELECT * FROM onboarding_enrollments WHERE tenant_id = ? AND user_id = ?').bind(tenant.id,userId).first<Enrollment>();
}
export function monthSlots(start: string, end: string, timezone: string) {
 let format: Intl.DateTimeFormat;
 try { format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit' }); } catch { throw new HTTPException(400,{message:'Invalid timezone.'}); }
 const slots: string[] = [];
 for(let t=Date.parse(`${start}T00:00:00Z`)-14*3600000; t<Date.parse(`${end}T00:00:00Z`)+14*3600000; t+=1800000) {
  const day=format.format(new Date(t));
  if(day>=start && day<end) slots.push(new Date(t).toISOString());
 }
 return slots;
}
async function finish(db: D1Database, tenantId: string, userId: string) {
 await db.batch([
  db.prepare(`UPDATE onboarding_enrollments SET completed_at = COALESCE(completed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE tenant_id = ? AND user_id = ? AND availability_saved_at IS NOT NULL
   AND ${onboardingSteps.map(s=>`json_extract(acknowledgements,'$.${s.id}') IS NOT NULL`).join(' AND ')}`).bind(tenantId,userId),
  db.prepare("UPDATE user_tasks SET status='completed',completed_at=COALESCE(completed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE tenant_id=? AND user_id=? AND entity_id='onboarding:v1' AND EXISTS (SELECT 1 FROM onboarding_enrollments WHERE tenant_id=? AND user_id=? AND completed_at IS NOT NULL)").bind(tenantId,userId,tenantId,userId),
 ]);
}
export function onboardingRoutes(getUser: (env: Env, request: Request) => Promise<{id:string}>) {
 const app = new Hono<{Bindings:Env}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next();});
 async function context(env:Env,request:Request) {
  const user=await getUser(env,request),tenant=await resolvePortalTenant(env.DB,request);
  const enrollment=await ensureOnboarding(env.DB,tenant,user.id);
  return {user,tenant,enrollment};
 }
 app.get('/',async c=>{
  const {tenant,enrollment}=await context(c.env,c.req.raw);
  return c.json(enrollment ? {enabled:true,organizationName:tenant.name,...enrollment,acknowledgements:JSON.parse(enrollment.acknowledgements),steps:onboardingSteps} : {enabled:false});
 });
 app.post('/steps/:step',async c=>{
  const {user,tenant,enrollment}=await context(c.env,c.req.raw);
  if(!enrollment)throw new HTTPException(404);
  const step=c.req.param('step');
  if(!onboardingSteps.some(s=>s.id===step))throw new HTTPException(400,{message:'Unknown onboarding step.'});
  const body=await c.req.json().catch(()=>null);
  if(body?.acknowledged!==true)throw new HTTPException(400,{message:'Confirm that you completed this step.'});
  await c.env.DB.prepare('UPDATE onboarding_enrollments SET acknowledgements=json_set(acknowledgements,?,?) WHERE tenant_id=? AND user_id=?').bind(`$.${step}`,new Date().toISOString(),tenant.id,user.id).run();
  await finish(c.env.DB,tenant.id,user.id);
  return c.json({ok:true});
 });
 app.get('/availability',async c=>{
  const {user,enrollment}=await context(c.env,c.req.raw);
  if(!enrollment)throw new HTTPException(404);
  const timezone=c.req.query('timezone')||'America/New_York';
  const slots=monthSlots(enrollment.start_date,enrollment.end_date,timezone);
  const history=await c.env.DB.prepare('SELECT slot,available FROM account_availability WHERE user_id=? AND slot<=? ORDER BY slot').bind(user.id,slots.at(-1)!).all<AvailabilityObservation>();
  const selection=accountSelection(slots,history.results,timezone);
  return c.json({start:enrollment.start_date,end:enrollment.end_date,timezone,slots,selected:selection.slots,suggested_slots:selection.suggested_slots});
 });
 app.put('/availability',async c=>{
  const {user,tenant,enrollment}=await context(c.env,c.req.raw);
  if(!enrollment)throw new HTTPException(404);
  const body=await c.req.json().catch(()=>null);
  if(typeof body?.timezone!=='string'||body.reviewed!==true)throw new HTTPException(400,{message:'Review the whole month and confirm your availability.'});
  const slots=monthSlots(enrollment.start_date,enrollment.end_date,body.timezone),allowed=new Set(slots);
  if(!Array.isArray(body.slots)||body.slots.length>slots.length||body.slots.some((s:unknown)=>typeof s!=='string'||!allowed.has(s))||new Set(body.slots).size!==body.slots.length)throw new HTTPException(400,{message:'Invalid availability selection.'});
  await c.env.DB.batch([
   c.env.DB.prepare(`INSERT INTO account_availability(user_id,slot,available) SELECT ?,s.value,EXISTS(SELECT 1 FROM json_each(?) selected WHERE selected.value=s.value) FROM json_each(?) s WHERE true ON CONFLICT(user_id,slot) DO UPDATE SET available=excluded.available,updated_at=CURRENT_TIMESTAMP`).bind(user.id,JSON.stringify(body.slots),JSON.stringify(slots)),
   c.env.DB.prepare("UPDATE onboarding_enrollments SET availability_saved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE tenant_id=? AND user_id=?").bind(tenant.id,user.id),
   c.env.DB.prepare("UPDATE user_tasks SET status='completed',completed_at=COALESCE(completed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE tenant_id=? AND user_id=? AND entity_id=?").bind(tenant.id,user.id,`availability-calendar:${tenant.organization_id}`),
  ]);
  await finish(c.env.DB,tenant.id,user.id);
  return c.json({ok:true});
 });
 return app;
}
