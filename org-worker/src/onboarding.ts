import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { resolvePortalTenant, type PortalTenant } from './timebank';
import { accountSelection, saveAccountAvailability, type AvailabilityObservation } from './accountAvailability';

export const onboardingSteps = [
 { id: 'constitution', title: 'Read the Constitution and bylaws', description: 'Review the linked document, currently marked as an unratified draft. Bring questions to an organizer.', href: 'https://codecollective.us/constitution' },
 { id: 'participation', title: 'Introduce Yourself', description: 'Introduce yourself and discuss a team or volunteer role with an organizer. The document describes team participation as a route to membership.', href: '/chat' },
 { id: 'communications', title: 'Review communications and conduct', description: 'Learn the community channels, expectations for respectful conduct, and how to raise concerns with organizers.', href: 'https://codecollective.us/constitution' },
 { id: 'meetings', title: 'Learn meetings and governance', description: 'Review meeting types and the motion, seconding, and voting process. Find an upcoming meeting to attend.', href: '/events' },
] as const;
function lifeTech(tenant: PortalTenant) { return tenant.home_org_slug === 'lifetech' || tenant.hostname === 'lifetech.fyi'; }
function stepsFor(tenant: PortalTenant) { return onboardingSteps.filter(step => !lifeTech(tenant) || !['communications', 'meetings'].includes(step.id)); }
export const onboardingTasks = [
 { id: 'availability', title: 'Indicate your meeting availability for a typical week' },
 ...onboardingSteps.map(({ id, title }) => ({ id, title })),
];
export function onboardingTaskId(step: string) { return `onboarding:v1:${step}`; }
function taskUpdates(db: D1Database, tenant: PortalTenant, userId: string) {
 const tenantId = tenant.id;
 const tasks = [{ id: 'availability', title: onboardingTasks[0].title }, ...stepsFor(tenant)];
 return [
  ...tasks.map(step => {
   const completion = step.id === 'availability' ? 'availability_saved_at' : `json_extract(acknowledgements,'$.${step.id}')`;
   return db.prepare(`INSERT INTO user_tasks (id,tenant_id,user_id,created_by_user_id,kind,entity_id,title,status,completed_at)
    SELECT ?,tenant_id,user_id,user_id,'personal',?,?,CASE WHEN ${completion} IS NULL THEN 'pending' ELSE 'completed' END,${completion}
    FROM onboarding_enrollments WHERE tenant_id=? AND user_id=?
    ON CONFLICT(tenant_id,user_id,kind,entity_id) DO UPDATE SET
    title=excluded.title,status=excluded.status,completed_at=COALESCE(user_tasks.completed_at,excluded.completed_at)`)
    .bind(crypto.randomUUID(),onboardingTaskId(step.id),step.title,tenantId,userId);
  }),
  ...(lifeTech(tenant) ? [db.prepare("DELETE FROM user_tasks WHERE tenant_id=? AND user_id=? AND kind='personal' AND entity_id IN ('onboarding:v1:communications','onboarding:v1:meetings')").bind(tenantId,userId)] : []),
  // Retire the aggregate task after its individual replacements are created.
  db.prepare("UPDATE user_tasks SET status='completed',completed_at=COALESCE(completed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE tenant_id=? AND user_id=? AND kind='personal' AND entity_id='onboarding:v1'").bind(tenantId,userId),
 ];
}
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
export type OnboardingActor = { id: string; account_id?: string };

export function identityProgressStatements(db: D1Database, tenant: PortalTenant, userId: string, sourceUserId: string) {
 if (sourceUserId === userId) return [];
 return [
  ...(onboardingEnabled(tenant) ? [db.prepare(`INSERT INTO onboarding_enrollments (tenant_id,user_id,start_date,end_date,acknowledgements,availability_saved_at,completed_at,created_at)
    SELECT tenant_id,?,start_date,end_date,acknowledgements,availability_saved_at,completed_at,created_at FROM onboarding_enrollments WHERE tenant_id=? AND user_id=?
    ON CONFLICT(tenant_id,user_id) DO UPDATE SET
    acknowledgements=json_patch(excluded.acknowledgements,onboarding_enrollments.acknowledgements),
    availability_saved_at=COALESCE(onboarding_enrollments.availability_saved_at,excluded.availability_saved_at),
    completed_at=COALESCE(onboarding_enrollments.completed_at,excluded.completed_at)`).bind(userId,tenant.id,sourceUserId)] : []),
  db.prepare(`INSERT INTO account_availability (user_id,slot,available,updated_at)
    SELECT ?,slot,available,updated_at FROM account_availability WHERE user_id=?
    ON CONFLICT(user_id,slot) DO UPDATE SET available=excluded.available,updated_at=excluded.updated_at
    WHERE julianday(excluded.updated_at)>julianday(account_availability.updated_at)`).bind(userId,sourceUserId),
 ];
}

export async function ensureOnboarding(db: D1Database, tenant: PortalTenant, userId: string, sourceUserId = userId) {
 if (!onboardingEnabled(tenant)) {
  const statements=identityProgressStatements(db,tenant,userId,sourceUserId);
  if(statements.length) await db.batch(statements);
  return null;
 }
 const start = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
 await db.batch([
  ...identityProgressStatements(db,tenant,userId,sourceUserId),
  db.prepare('INSERT INTO onboarding_enrollments (tenant_id,user_id,start_date,end_date) VALUES (?,?,?,?) ON CONFLICT DO NOTHING').bind(tenant.id,userId,start,nextMonth(start)),
 ]);
 await finish(db,tenant,userId);
 return db.prepare('SELECT * FROM onboarding_enrollments WHERE tenant_id = ? AND user_id = ?').bind(tenant.id,userId).first<Enrollment>();
}
export function typicalWeekEnd(start: string) {
 const end = new Date(`${start}T00:00:00Z`);
 end.setUTCDate(end.getUTCDate() + 7);
 return end.toISOString().slice(0, 10);
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
async function finish(db: D1Database, tenant: PortalTenant, userId: string) {
 const tenantId = tenant.id;
 await db.batch([
  db.prepare(`UPDATE onboarding_enrollments SET completed_at = COALESCE(completed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE tenant_id = ? AND user_id = ? AND availability_saved_at IS NOT NULL
   AND ${stepsFor(tenant).map(s=>`json_extract(acknowledgements,'$.${s.id}') IS NOT NULL`).join(' AND ')}`).bind(tenantId,userId),
  ...taskUpdates(db,tenant,userId),
 ]);
}
export function onboardingRoutes(getUser: (env: Env, request: Request) => Promise<OnboardingActor>) {
 const app = new Hono<{Bindings:Env}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next();});
 async function context(env:Env,request:Request) {
  const user=await getUser(env,request),tenant=await resolvePortalTenant(env.DB,request);
  const accountId=user.id;
  const enrollment=await ensureOnboarding(env.DB,tenant,accountId,user.account_id || user.id);
  return {user,accountId,tenant,enrollment};
 }
 app.get('/',async c=>{
  const {tenant,enrollment}=await context(c.env,c.req.raw);
  return c.json(enrollment ? {enabled:true,organizationName:tenant.name,...enrollment,acknowledgements:JSON.parse(enrollment.acknowledgements),steps:stepsFor(tenant).map(step => lifeTech(tenant) && ['constitution','communications','participation'].includes(step.id) ? {...step,description:step.id==='constitution'?'Read the current Constitution and Bylaws and its ratification status.':step.description,href:step.id==='participation'?'/chat?start=org&org=lifetech':'/governance/documents/lifetech-constitution'} : step)} : {enabled:false});
 });
 app.post('/steps/:step',async c=>{
  const {user,accountId,tenant,enrollment}=await context(c.env,c.req.raw);
  if(!enrollment)throw new HTTPException(404);
  const step=c.req.param('step');
  if(!stepsFor(tenant).some(s=>s.id===step))throw new HTTPException(400,{message:'Unknown onboarding step.'});
  const body=await c.req.json().catch(()=>null);
  if(body?.acknowledged!==true)throw new HTTPException(400,{message:'Confirm that you completed this step.'});
  await c.env.DB.prepare('UPDATE onboarding_enrollments SET acknowledgements=json_set(acknowledgements,?,?) WHERE tenant_id=? AND user_id=?').bind(`$.${step}`,new Date().toISOString(),tenant.id,accountId).run();
  await finish(c.env.DB,tenant,accountId);
  return c.json({ok:true});
 });
 app.get('/availability',async c=>{
  const {accountId,enrollment}=await context(c.env,c.req.raw);
  if(!enrollment)throw new HTTPException(404);
  const timezone=c.req.query('timezone')||'America/New_York';
  const slots=monthSlots(enrollment.start_date,typicalWeekEnd(enrollment.start_date),timezone);
  const history=await c.env.DB.prepare('SELECT slot,available FROM account_availability WHERE user_id=? AND slot<=? ORDER BY slot').bind(accountId,slots.at(-1)!).all<AvailabilityObservation>();
  const selection=accountSelection(slots,history.results,timezone);
  return c.json({start:enrollment.start_date,end:typicalWeekEnd(enrollment.start_date),timezone,slots,selected:selection.slots,suggested_slots:selection.suggested_slots});
 });
 app.put('/availability',async c=>{
  const {user,accountId,tenant,enrollment}=await context(c.env,c.req.raw);
  if(!enrollment)throw new HTTPException(404);
  const body=await c.req.json().catch(()=>null);
  if(typeof body?.timezone!=='string'||body.reviewed!==true)throw new HTTPException(400,{message:'Review your typical week and confirm your availability.'});
  const slots=monthSlots(enrollment.start_date,typicalWeekEnd(enrollment.start_date),body.timezone),allowed=new Set(slots);
  if(!Array.isArray(body.slots)||body.slots.length>slots.length||body.slots.some((s:unknown)=>typeof s!=='string'||!allowed.has(s))||new Set(body.slots).size!==body.slots.length)throw new HTTPException(400,{message:'Invalid availability selection.'});
  await c.env.DB.batch([
   saveAccountAvailability(c.env.DB,accountId,slots,body.slots),
   c.env.DB.prepare("UPDATE onboarding_enrollments SET availability_saved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE tenant_id=? AND user_id=?").bind(tenant.id,accountId),
   c.env.DB.prepare("UPDATE user_tasks SET status='completed',completed_at=COALESCE(completed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE tenant_id=? AND user_id=? AND entity_id=?").bind(tenant.id,user.id,`availability-calendar:${tenant.organization_id}`),
  ]);
  await finish(c.env.DB,tenant,accountId);
  return c.json({ok:true});
 });
 return app;
}
