import { contactUnsubscribeToken } from './emailContactPreferences';
import { Hono } from 'hono';
import { emailAudit, requireEmailOrganizer } from './emailAccess';
import { emailFail, emailPortalBase, normalizeEmail, subscriptionStatement, type EmailActor } from './emailShared';

export function emailGroups(getUser: (env: Env, request: Request) => Promise<EmailActor>) {
  const routes = new Hono<{Bindings: Env}>();
  routes.get('/', async c => {
    const user = await getUser(c.env,c.req.raw);
    const rows = await c.env.DB.prepare(`SELECT o.id,o.name,o.slug FROM organizations o
      JOIN organization_memberships m ON m.organization_id=o.id
      WHERE m.user_id=? AND m.status='active' AND m.role IN ('owner','administrator') ORDER BY o.name`).bind(user.id).all();
    return c.json(rows.results || []);
  });
  // Preferences expose only the signed-in person's record; membership is not consent.
  routes.get('/:organizationId/subscription', async c => {
    const user = await getUser(c.env,c.req.raw);
    const row = await c.env.DB.prepare(`SELECT status,consent_source,consented_at,unsubscribed_at FROM email_subscriptions
      WHERE user_id=? AND topic_type='organization' AND topic_id=?`).bind(user.id,c.req.param('organizationId')).first();
    return c.json(row || {status:'unsubscribed'});
  });
  routes.put('/:organizationId/subscription', async c => {
    const user = await getUser(c.env,c.req.raw);
    const organizationId=c.req.param('organizationId');
    if (!await c.env.DB.prepare('SELECT id FROM organizations WHERE id=?').bind(organizationId).first()) emailFail(404,'Group not found.');
    const payload=await c.req.json().catch(()=>({})) as {subscribed?:unknown};
    if(typeof payload.subscribed!=='boolean') emailFail(400,'Choose an email preference.');
    const existing=await c.env.DB.prepare("SELECT user_id FROM email_subscriptions WHERE email=? AND topic_type='organization' AND topic_id=?").bind(normalizeEmail(user.email),organizationId).first<{user_id:string}>();
    if(existing && existing.user_id!==user.id) emailFail(409,'This email preference cannot be changed from this account.');
    await c.env.DB.batch([...(payload.subscribed ? [c.env.DB.prepare('DELETE FROM email_contact_suppressions WHERE organization_id=? AND email=?').bind(organizationId,normalizeEmail(user.email))] : []),subscriptionStatement(c.env.DB,user,'organization',organizationId,payload.subscribed,'group-email-preferences'),
      emailAudit(c.env,user.id,organizationId,payload.subscribed?'subscription.opt-in':'subscription.opt-out')]);
    return c.json({ok:true});
  });
  routes.use('/:organizationId/*',async(c,next)=>{
    const user=await getUser(c.env,c.req.raw);
    await requireEmailOrganizer(c.env,user,c.req.param('organizationId'));
    await next();
  });
  routes.get('/:organizationId/audience',async c=>{
    const user=await getUser(c.env,c.req.raw),organizationId=c.req.param('organizationId');
    const rows=await c.env.DB.prepare(`SELECT id,name,email FROM email_subscriptions WHERE topic_type='organization' AND topic_id=? AND status='subscribed' AND NOT EXISTS(SELECT 1 FROM email_contact_suppressions x WHERE x.organization_id=email_subscriptions.topic_id AND x.email=email_subscriptions.email) ORDER BY email LIMIT 1001`).bind(organizationId).all();
    if((rows.results?.length || 0)>1000) emailFail(400,'Use an audience of 1,000 or fewer subscribers.');
    await emailAudit(c.env,user.id,organizationId,'audience.view',null,rows.results?.length || 0).run();
    return c.json({event_count:0,organization_count:rows.results?.length || 0,contacts:rows.results || []});
  });
  routes.get('/:organizationId/events',async c=>{
    const rows=await c.env.DB.prepare('SELECT id,title,host_org_id FROM events WHERE host_org_id=? ORDER BY starts_at DESC LIMIT 500').bind(c.req.param('organizationId')).all();
    return c.json(rows.results || []);
  });
  routes.post('/:organizationId/unsubscribe-link',async c=>{
    const user=await getUser(c.env,c.req.raw),organizationId=c.req.param('organizationId');
    const payload=await c.req.json().catch(()=>({})) as {email?:unknown};
    const email=normalizeEmail(payload.email);
    if(!email)emailFail(400,'Enter a valid recipient email.');
    const token=await contactUnsubscribeToken(c.env,{email,organizationId});
    await emailAudit(c.env,user.id,organizationId,'unsubscribe-link.create').run();
    return c.json({url:`${new URL(emailPortalBase(c.env)).origin}/api/org/api/email/contact-unsubscribe?token=${encodeURIComponent(token)}`});
  });
  routes.get('/:organizationId/suppressions',async c=>{
    const rows=await c.env.DB.prepare('SELECT email,source,unsubscribed_at,updated_at FROM email_contact_suppressions WHERE organization_id=? ORDER BY email LIMIT 1001').bind(c.req.param('organizationId')).all();
    return c.json(rows.results || []);
  });
  routes.get('/:organizationId/subscribers',async c=>{
    const user=await getUser(c.env,c.req.raw), organizationId=c.req.param('organizationId');
    const status=c.req.query('status') || 'all';
    if(!['all','subscribed','unsubscribed'].includes(status)) emailFail(400,'Invalid subscription status.');
    const offset=Number(c.req.query('offset') || 0);
    if(!Number.isSafeInteger(offset)||offset<0) emailFail(400,'Invalid page.');
    const rows=await c.env.DB.prepare(`SELECT id,name,email,status,consent_source,consented_at,unsubscribed_at,updated_at
      FROM email_subscriptions WHERE topic_type='organization' AND topic_id=? AND (?='all' OR status=?)
      ORDER BY email,id LIMIT 101 OFFSET ?`).bind(organizationId,status,status,offset).all();
    const items=rows.results || [];
    await emailAudit(c.env,user.id,organizationId,'subscribers.view',null,Math.min(items.length,100)).run();
    return c.json({items:items.slice(0,100),has_more:items.length>100,exports_enabled:c.env.EMAIL_EXPORTS_ENABLED==='true'});
  });
  routes.post('/:organizationId/subscribers/:id/unsubscribe',async c=>{
    const user=await getUser(c.env,c.req.raw),organizationId=c.req.param('organizationId'),id=c.req.param('id');
    const found=await c.env.DB.prepare("SELECT id FROM email_subscriptions WHERE id=? AND topic_type='organization' AND topic_id=?").bind(id,organizationId).first();
    if(!found) emailFail(404,'Subscriber not found.');
    const now=Date.now();
    await c.env.DB.batch([c.env.DB.prepare(`UPDATE email_subscriptions SET status='unsubscribed',consent_source='organizer-suppression',unsubscribed_at=?,updated_at=?
      WHERE id=? AND topic_type='organization' AND topic_id=?`).bind(now,now,id,organizationId),emailAudit(c.env,user.id,organizationId,'subscription.suppressed',id)]);
    return c.json({ok:true});
  });
  routes.get('/:organizationId/segments',async c=>{
    const rows=await c.env.DB.prepare('SELECT id,name,subscription_ids_json FROM email_segments WHERE organization_id=? AND expires_at>? ORDER BY name').bind(c.req.param('organizationId'),Date.now()).all();
    return c.json((rows.results || []).map(row=>({id:row.id,name:row.name,subscription_ids:JSON.parse(String(row.subscription_ids_json))})));
  });
  routes.post('/:organizationId/segments',async c=>{
    const user=await getUser(c.env,c.req.raw),organizationId=c.req.param('organizationId');
    const payload=await c.req.json().catch(()=>({})) as {name?:unknown;subscription_ids?:unknown};
    const name=typeof payload.name==='string'?payload.name.trim():'';
    if(!name || name.length>80 || !Array.isArray(payload.subscription_ids)||!payload.subscription_ids.length||payload.subscription_ids.length>1000||payload.subscription_ids.some(id=>typeof id!=='string')) emailFail(400,'Enter a segment name and select up to 1,000 subscribers.');
    const ids=[...new Set(payload.subscription_ids as string[])];
    const rows=await c.env.DB.prepare(`SELECT id FROM email_subscriptions WHERE topic_type='organization' AND topic_id=? AND status='subscribed' AND id IN (SELECT value FROM json_each(?))`).bind(organizationId,JSON.stringify(ids)).all();
    if(rows.results?.length!==ids.length) emailFail(400,'Segments may contain only current subscribers to this group.');
    const id=crypto.randomUUID(),now=Date.now();
    await c.env.DB.batch([c.env.DB.prepare(`INSERT INTO email_segments(id,organization_id,name,subscription_ids_json,created_at,expires_at) VALUES(?,?,?,?,?,?)`).bind(id,organizationId,name,JSON.stringify(ids),now,now+365*86_400_000),emailAudit(c.env,user.id,organizationId,'segment.created',id,ids.length)]);
    return c.json({id},201);
  });
  routes.delete('/:organizationId/segments/:id',async c=>{
    const user=await getUser(c.env,c.req.raw),organizationId=c.req.param('organizationId'),id=c.req.param('id');
    if(!await c.env.DB.prepare('SELECT id FROM email_segments WHERE id=? AND organization_id=?').bind(id,organizationId).first()) emailFail(404,'Segment not found.');
    await c.env.DB.batch([c.env.DB.prepare('DELETE FROM email_segments WHERE id=? AND organization_id=?').bind(id,organizationId),emailAudit(c.env,user.id,organizationId,'segment.deleted',id)]);
    return c.json({ok:true});
  });
  routes.get('/:organizationId/audit',async c=>{
    const rows=await c.env.DB.prepare('SELECT action,actor_user_id,record_count,created_at FROM email_mailing_audit WHERE organization_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 100').bind(c.req.param('organizationId'),Date.now()).all();
    return c.json(rows.results || []);
  });
  routes.get('/:organizationId/export',async c=>{
    if(c.env.EMAIL_EXPORTS_ENABLED!=='true') emailFail(403,'Mailing-list exports are disabled.');
    const user=await getUser(c.env,c.req.raw),organizationId=c.req.param('organizationId');
    const rows=await c.env.DB.prepare(`SELECT name,email,status,consent_source,consented_at,unsubscribed_at FROM email_subscriptions WHERE topic_type='organization' AND topic_id=? ORDER BY email LIMIT 10001`).bind(organizationId).all();
    if((rows.results?.length || 0)>10000) emailFail(400,'Export is limited to 10,000 records.');
    const csv=(v:unknown)=>'"'+String(v ?? '').replace(/^[\s]*[=+@\-]|^[\t\r\n]/,"'$&").replaceAll('"','""')+'"';
    const keys=['name','email','status','consent_source','consented_at','unsubscribed_at'];
    await emailAudit(c.env,user.id,organizationId,'subscribers.export',null,rows.results?.length || 0).run();
    return c.body([keys.join(','),...(rows.results || []).map(row=>keys.map(k=>csv(row[k])).join(','))].join('\r\n'),200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="group-subscribers.csv"'});
  });
  return routes;
}
