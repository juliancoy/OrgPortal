import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { resolvePortalTenant } from './timebank';
import { ensureOnboarding, onboardingEnabled, onboardingTasks, onboardingTaskId } from './onboarding';
type Actor = { id: string };
type Task = { id: string; kind: 'personal' | 'availability'; entity_id: string | null; title: string; status: string; created_at: string };
export function userTaskRoutes(getUser: (env: Env, request: Request) => Promise<Actor>) {
 const app = new Hono<{ Bindings: Env }>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next();});
 app.get('/',async c=>{
  const user=await getUser(c.env,c.req.raw),tenant=await resolvePortalTenant(c.env.DB,c.req.raw);
  await ensureOnboarding(c.env.DB,tenant,user.id);
  const rows=await c.env.DB.prepare(`SELECT id,kind,entity_id,title,status,created_at FROM user_tasks WHERE tenant_id = ? AND user_id = ? AND status = 'pending' AND NOT (? = 1 AND kind = 'personal' AND COALESCE(entity_id,'') = ?) ORDER BY CASE entity_id ${onboardingTasks.map((step,index)=>`WHEN '${onboardingTaskId(step.id)}' THEN ${index}`).join(' ')} ELSE ${onboardingTasks.length} END,created_at,id`).bind(tenant.id,user.id,onboardingEnabled(tenant)?1:0,`availability-calendar:${tenant.organization_id}`).all<Task>();
  return c.json({tasks:(rows.results||[]).map(task=>({...task,href:task.entity_id?.startsWith('onboarding:v1:')?`/onboarding#${encodeURIComponent(task.entity_id.slice('onboarding:v1:'.length))}`:task.entity_id==='onboarding:v1'?'/onboarding':task.kind==='personal'&&task.entity_id?.startsWith('availability-calendar:')?(onboardingEnabled(tenant)?'/onboarding#availability':'/availability'):task.kind==='availability'?`/availability/${encodeURIComponent(task.entity_id!)}`:null}))});
 });
 app.post('/',async c=>{
  const user=await getUser(c.env,c.req.raw),tenant=await resolvePortalTenant(c.env.DB,c.req.raw);
  const body=await c.req.json().catch(()=>null) as {title?:unknown}|null;
  if(typeof body?.title!=='string'||!body.title.trim()||body.title.length>160)throw new HTTPException(400,{message:'Use a task title of 1–160 characters.'});
  const id=crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO user_tasks (id,tenant_id,user_id,created_by_user_id,kind,title) VALUES (?,?,?,?,'personal',?)`).bind(id,tenant.id,user.id,user.id,body.title.trim()).run();
  return c.json({id},201);
 });
 app.post('/:id/complete',async c=>{
  const user=await getUser(c.env,c.req.raw),tenant=await resolvePortalTenant(c.env.DB,c.req.raw);
  const task=await c.env.DB.prepare('SELECT id,kind,entity_id FROM user_tasks WHERE id = ? AND tenant_id = ? AND user_id = ?').bind(c.req.param('id'),tenant.id,user.id).first<Task>();
  if(!task)throw new HTTPException(404,{message:'Task not found.'});
  if((task.entity_id==='onboarding:v1'||task.entity_id?.startsWith('onboarding:v1:'))||(onboardingEnabled(tenant)&&task.entity_id?.startsWith('availability-calendar:')))throw new HTTPException(409,{message:'Complete the required onboarding steps to finish this task.'});
  if(task.kind==='availability')throw new HTTPException(409,{message:'Save your availability to complete this task.'});
  await c.env.DB.prepare("UPDATE user_tasks SET status = 'completed',completed_at = COALESCE(completed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ? AND tenant_id = ? AND user_id = ?").bind(task.id,tenant.id,user.id).run();
  return c.json({ok:true});
 });
 return app;
}
