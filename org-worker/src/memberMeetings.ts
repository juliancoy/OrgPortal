import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { accountSelection, type AvailabilityObservation } from './accountAvailability';
import { resolvePortalTenant, type PortalTenant } from './timebank';

export const organizersMeetupTag = 'lifetech-organizers-meetup';
const halfHour = 1800000;
type Interval = { starts_at:string; ends_at:string };
type Preference = { enabled:number; timezone:string };
type Meeting = Interval & { id:string;host_user_id:string;guest_user_id:string;status:string };
const reject = (status:400|403|404|409,message:string):never => {throw new HTTPException(status,{message});};
export function overlaps(start:string,end:string,interval:Interval) {
 return Date.parse(start)<Date.parse(interval.ends_at) && Date.parse(end)>Date.parse(interval.starts_at);
}
function startTime(value:unknown) {
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||Date.parse(value)%halfHour!==0)reject(400,'Choose a valid half-hour start time.');
 const time=Date.parse(value as string);
 if(time<=Date.now()||time>Date.now()+90*86400000)reject(400,'Choose a time within the next 90 days.');
 return new Date(time).toISOString();
}
async function member(db:D1Database,organizationId:string|null|undefined,userId:string) {
 if(!organizationId || !(await db.prepare("SELECT 1 FROM organization_memberships WHERE organization_id=? AND user_id=? AND status='active'").bind(organizationId,userId).first()))reject(403,'Active organization membership is required to schedule meetings.');
}
async function preference(db:D1Database,tenantId:string,userId:string) {
 return db.prepare('SELECT enabled,timezone FROM member_meeting_preferences WHERE tenant_id=? AND user_id=?').bind(tenantId,userId).first<Preference>();
}
async function history(db:D1Database,userId:string) {
 return (await db.prepare('SELECT slot,available FROM account_availability WHERE user_id=? ORDER BY slot').bind(userId).all<AvailabilityObservation>()).results;
}
// These events are maintained through the native event MCP preview/apply tools.
async function organizersEvents(db:D1Database,tenant:PortalTenant) {
 return (await db.prepare(`SELECT starts_at,ends_at FROM events WHERE host_org_id=?
  AND EXISTS (SELECT 1 FROM json_each(events.tags) WHERE value=?) AND starts_at IS NOT NULL AND ends_at IS NOT NULL ORDER BY starts_at,ends_at`)
  .bind(tenant.organization_id,organizersMeetupTag).all<Interval>()).results;
}
function month(value:string) {
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).format(new Date(value));
}
function clearOfOrganizers(tenant:PortalTenant,start:string,end:string,events:Interval[]) {
 // Until the month's organizers meetup is established, do not promise conflict-free bookings.
 if(tenant.home_org_slug==='lifetech' && !events.some(event=>month(event.starts_at)===month(start)))return false;
 return !events.some(event=>overlaps(start,end,event));
}
async function busy(db:D1Database,host:string,guest:string) {
 return (await db.prepare(`SELECT starts_at,ends_at FROM member_meetings WHERE status='confirmed'
  AND (host_user_id IN (?,?) OR guest_user_id IN (?,?))
  UNION ALL SELECT e.starts_at,COALESCE(e.ends_at,strftime('%Y-%m-%dT%H:%M:%fZ',e.starts_at,'+1 hour'))
  FROM event_registrations r JOIN events e ON e.id=r.event_id WHERE r.user_id IN (?,?) AND e.starts_at IS NOT NULL
  UNION ALL SELECT a.starts_at,a.ends_at FROM health_insurance_appointments a
  JOIN health_insurance_services s ON s.id=a.service_id WHERE a.status IN ('requested','confirmed')
  AND (a.user_id IN (?,?) OR s.host_user_id IN (?,?))`)
  .bind(host,guest,host,guest,host,guest,host,guest,host,guest).all<Interval>()).results;
}
export function memberMeetingRoutes(getUser:(env:Env,request:Request)=>Promise<{id:string}>) {
 const app=new Hono<{Bindings:Env}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next();});
 async function context(env:Env,request:Request) {
  const user=await getUser(env,request),tenant=await resolvePortalTenant(env.DB,request);
  await member(env.DB,tenant.organization_id,user.id);
  return {user,tenant};
 }
 app.get('/preferences',async c=>{
  const {user,tenant}=await context(c.env,c.req.raw);
  const saved=await preference(c.env.DB,tenant.id,user.id);
  return c.json({enabled:!!saved?.enabled,timezone:saved?.timezone||'America/New_York'});
 });
 app.put('/preferences',async c=>{
  const {user,tenant}=await context(c.env,c.req.raw),body=await c.req.json().catch(()=>null);
  if(typeof body?.enabled!=='boolean'||typeof body?.timezone!=='string')reject(400,'Choose whether members can book meetings and a timezone.');
  try {new Intl.DateTimeFormat('en',{timeZone:body.timezone});}catch{reject(400,'Invalid timezone.');}
  await c.env.DB.prepare(`INSERT INTO member_meeting_preferences(tenant_id,user_id,enabled,timezone) VALUES (?,?,?,?)
   ON CONFLICT(tenant_id,user_id) DO UPDATE SET enabled=excluded.enabled,timezone=excluded.timezone`).bind(tenant.id,user.id,body.enabled?1:0,body.timezone).run();
  return c.json({ok:true});
 });
 app.get('/',async c=>{
  const {user,tenant}=await context(c.env,c.req.raw);
  const rows=await c.env.DB.prepare("SELECT * FROM member_meetings WHERE tenant_id=? AND (host_user_id=? OR guest_user_id=?) ORDER BY starts_at DESC LIMIT 100").bind(tenant.id,user.id,user.id).all<Meeting>();
  return c.json({meetings:rows.results});
 });
 app.post('/:id/cancel',async c=>{
  const {user,tenant}=await context(c.env,c.req.raw);
  const result=await c.env.DB.prepare("UPDATE member_meetings SET status='cancelled' WHERE id=? AND tenant_id=? AND (host_user_id=? OR guest_user_id=?)").bind(c.req.param('id'),tenant.id,user.id,user.id).run();
  if(!result.meta.changes)reject(404,'Meeting not found.');
  return c.json({ok:true});
 });
 app.get('/:host/slots',async c=>{
  const {user,tenant}=await context(c.env,c.req.raw),host=c.req.param('host');
  await member(c.env.DB,tenant.organization_id,host);
  const settings=await preference(c.env.DB,tenant.id,host);
  if(!settings?.enabled) return c.json({slots:[],message:'This person has not enabled meeting bookings.'});
  const requestedStart=Date.parse(c.req.query('start')||''),end=Date.parse(c.req.query('end')||'');
  if(!Number.isFinite(requestedStart)||requestedStart%halfHour!==0||!Number.isFinite(end)||end<=Math.max(requestedStart,Date.now())||end-requestedStart>14*86400000||end>Date.now()+90*86400000)reject(400,'Choose a range of up to 14 days within the next 90 days.');
  const start=new Date(Math.max(requestedStart,Math.ceil((Date.now()+1)/halfHour)*halfHour)).toISOString();
  const slots:string[]=[];
  for(let time=Date.parse(start);time+halfHour<=end;time+=halfHour)slots.push(new Date(time).toISOString());
  const [observations,events,conflicts]=await Promise.all([history(c.env.DB,host),organizersEvents(c.env.DB,tenant),busy(c.env.DB,host,user.id)]);
  const available=accountSelection(slots,observations,settings.timezone).slots.filter(slot=>{
   const finish=new Date(Date.parse(slot)+halfHour).toISOString();
   return clearOfOrganizers(tenant,slot,finish,events)&&!conflicts.some(interval=>overlaps(slot,finish,interval));
  });
  return c.json({slots:available,timezone:settings.timezone,message:available.length?'':'No bookable times in this range. LifeTech dates require an established monthly organizers meetup.'});
 });
 app.post('/:host/book',async c=>{
  const {user,tenant}=await context(c.env,c.req.raw),host=c.req.param('host');
  if(host===user.id)reject(400,'Choose another member.');
  await member(c.env.DB,tenant.organization_id,host);
  const body=await c.req.json().catch(()=>null),start=startTime(body?.starts_at),end=new Date(Date.parse(start)+halfHour).toISOString();
  const settings=await preference(c.env.DB,tenant.id,host),observations=await history(c.env.DB,host);
  if(!settings?.enabled||!accountSelection([start],observations,settings.timezone).slots.includes(start))reject(409,'This time is no longer available.');
  const events=await organizersEvents(c.env.DB,tenant),conflicts=await busy(c.env.DB,host,user.id);
  if(!clearOfOrganizers(tenant,start,end,events)||conflicts.some(interval=>overlaps(start,end,interval)))reject(409,'This time conflicts with another meeting or the organizers meetup.');
  // Recheck snapshots and booking conflicts within the atomic write, so racing requests cannot double-book.
  const id=crypto.randomUUID();
  const result=await c.env.DB.prepare(`INSERT INTO member_meetings(id,tenant_id,host_user_id,guest_user_id,starts_at,ends_at)
   SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM member_meeting_preferences WHERE tenant_id=? AND user_id=? AND enabled=1 AND timezone=?)
   AND (SELECT json_group_array(json_object('slot',slot,'available',available)) FROM (SELECT slot,available FROM account_availability WHERE user_id=? ORDER BY slot))=?
   AND NOT EXISTS (SELECT 1 FROM member_meetings WHERE status='confirmed' AND starts_at<? AND ends_at>?
    AND (host_user_id IN (?,?) OR guest_user_id IN (?,?)))
   AND NOT EXISTS (SELECT 1 FROM events WHERE host_org_id=? AND EXISTS (SELECT 1 FROM json_each(events.tags) WHERE value=?) AND julianday(starts_at)<julianday(?) AND julianday(ends_at)>julianday(?))
   AND (SELECT json_group_array(json_object('starts_at',starts_at,'ends_at',ends_at)) FROM
    (SELECT starts_at,ends_at FROM events WHERE host_org_id=? AND EXISTS (SELECT 1 FROM json_each(events.tags) WHERE value=?) AND starts_at IS NOT NULL AND ends_at IS NOT NULL ORDER BY starts_at,ends_at))=?
   AND NOT EXISTS (SELECT 1 FROM event_registrations r JOIN events e ON e.id=r.event_id WHERE r.user_id IN (?,?)
    AND julianday(e.starts_at)<julianday(?) AND julianday(COALESCE(e.ends_at,strftime('%Y-%m-%dT%H:%M:%fZ',e.starts_at,'+1 hour')))>julianday(?))
   AND NOT EXISTS (SELECT 1 FROM health_insurance_appointments a JOIN health_insurance_services s ON s.id=a.service_id
    WHERE a.status IN ('requested','confirmed') AND (a.user_id IN (?,?) OR s.host_user_id IN (?,?))
    AND julianday(a.starts_at)<julianday(?) AND julianday(a.ends_at)>julianday(?))
   AND EXISTS (SELECT 1 FROM organization_memberships WHERE organization_id=? AND user_id=? AND status='active')
   AND EXISTS (SELECT 1 FROM organization_memberships WHERE organization_id=? AND user_id=? AND status='active')`)
   .bind(id,tenant.id,host,user.id,start,end,tenant.id,host,settings!.timezone,host,JSON.stringify(observations),end,start,host,user.id,host,user.id,tenant.organization_id,organizersMeetupTag,end,start,tenant.organization_id,organizersMeetupTag,JSON.stringify(events),host,user.id,end,start,host,user.id,host,user.id,end,start,tenant.organization_id,host,tenant.organization_id,user.id).run();
  if(!result.meta.changes)reject(409,'Availability changed. Refresh the available times.');
  return c.json({id,starts_at:start,ends_at:end,status:'confirmed'},201);
 });
 return app;
}
