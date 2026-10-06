import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { googleConfig, normalizeEmail } from './emailShared';
type Actor = {id:string;email?:string|null};
export type NotificationPreferences = {organization_status_email:boolean;organization_status_push:boolean;push_enabled:boolean};
export async function notificationPreferences(db:D1Database,userId:string):Promise<NotificationPreferences> {
  const row=await db.prepare('SELECT organization_status_email,organization_status_push,push_enabled FROM notification_preferences WHERE user_id=?').bind(userId).first<Record<string,number>>();
  return {organization_status_email:row?.organization_status_email!==0,organization_status_push:row?.organization_status_push!==0,push_enabled:row?.push_enabled!==0};
}
export async function accountPushEnabled(db:D1Database,userId:string) {
  const row=await db.prepare('SELECT push_enabled FROM notification_preferences WHERE user_id=?').bind(userId).first<{push_enabled:number}>();
  return row?.push_enabled!==0;
}
export function notificationPreferenceRoutes(getUser:(env:Env,request:Request)=>Promise<Actor>) {
  const routes=new Hono<{Bindings:Env}>();
  routes.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next();});
  routes.get('/',async c=>{
    const user=await getUser(c.env,c.req.raw);
    // The address comes exclusively from the authenticated identity, never from
    // a membership payload or another account with the same email.
    await c.env.DB.prepare(`INSERT INTO notification_preferences (user_id,email) VALUES (?,?)
      ON CONFLICT(user_id) DO UPDATE SET email=excluded.email`).bind(user.id,normalizeEmail(user.email)||null).run();
    let configured=true;try {googleConfig(c.env);}catch {configured=false;}
    const sender=await c.env.DB.prepare("SELECT owner_user_id FROM email_senders WHERE status='connected' LIMIT 1").first();
    return c.json({...await notificationPreferences(c.env.DB,user.id),email_delivery_ready:configured&&!!sender&&c.env.ORGANIZATION_STATUS_EMAIL_ENABLED!=='false'});
  });
  routes.put('/',async c=>{
    const user=await getUser(c.env,c.req.raw);
    const body=await c.req.json().catch(()=>null);
    const keys=['organization_status_email','organization_status_push','push_enabled'];
    if(!body||Array.isArray(body)||Object.keys(body).length===0||Object.keys(body).some(key=>!keys.includes(key)||typeof body[key]!=='boolean'))
      throw new HTTPException(400,{message:'Choose valid notification preferences.'});
    await c.env.DB.prepare(`INSERT INTO notification_preferences (user_id,email,organization_status_email,organization_status_push,push_enabled)
      VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,organization_status_email=CASE WHEN ? THEN excluded.organization_status_email ELSE notification_preferences.organization_status_email END,
      organization_status_push=CASE WHEN ? THEN excluded.organization_status_push ELSE notification_preferences.organization_status_push END,
      push_enabled=CASE WHEN ? THEN excluded.push_enabled ELSE notification_preferences.push_enabled END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
      .bind(user.id,normalizeEmail(user.email)||null,Number(body.organization_status_email??true),Number(body.organization_status_push??true),Number(body.push_enabled??true),
        Number('organization_status_email' in body),Number('organization_status_push' in body),Number('push_enabled' in body)).run();
    return c.json(await notificationPreferences(c.env.DB,user.id));
  });
  return routes;
}
