import { claimRecommendation, teammateInvitationNotice, createGuestPresentationTeam, guestClaimPath, sendGuestAcknowledgement, guestClaimApplication, type GuestPresentationActor, type GuestPresentationEnv } from './guestPresentationAccounts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authorizeOrganization } from './organizationIam';
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
function document(title:string,body:string){return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f8f6;color:#173c34;font:16px/1.5 system-ui,sans-serif}main{max-width:640px;margin:0 auto;padding:32px 20px}h1{line-height:1.2;font-size:2rem}form{display:grid;gap:18px}label{display:grid;gap:6px;font-weight:600}input,textarea,button{font:inherit;width:100%;padding:12px;border:1px solid #78978e;border-radius:8px;background:white;color:inherit}textarea{resize:vertical}button{background:#155e59;color:white;border:2px solid #d4af37;cursor:pointer;font-weight:600}small{font-weight:400}.trap{display:none}a{color:#155e59}p{margin:0 0 20px}
</style><main>${body}</main></html>`}
export function guestPresentationRoutes<E extends GuestPresentationEnv>(auth:(env:E,request:Request)=>Promise<GuestPresentationActor>){
 const app=new Hono<{Bindings:E}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');c.header('X-Robots-Tag','noindex');c.header('X-Content-Type-Options','nosniff');c.header('Referrer-Policy','no-referrer');c.header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");await next()});
 async function event(db:D1Database,id:string){
  const row=await db.prepare(`SELECT e.id,e.title,e.host_org_id,e.starts_at,e.ends_at,COALESCE(f.enabled,0) AS enabled FROM events e LEFT JOIN event_presentation_forms f ON f.event_id=e.id WHERE e.id=?`).bind(id).first<{id:string;title:string;host_org_id:string;starts_at:string;ends_at:string|null;enabled:number}>();
  if(!row?.host_org_id)throw new HTTPException(404,{message:'Event not found'});return row;
 }
 app.get('/:id/presentations/apply',async c=>{
  const e=await event(c.env.DB,c.req.param('id'));
  if(!e.enabled||!e.starts_at||Date.parse(e.starts_at)<=Date.now())return c.html(document('Applications closed','<h1>Applications are closed</h1><p>This event is not accepting presentation applications.</p>'),409);
  return c.html(document('Present at '+e.title,`<h1>Present at ${escapeHtml(e.title)}</h1><p>Tell the organizers what you’d like to share. No account needed.</p><form method="post" action="">
<label>Your name<input name="contact_name" required maxlength="200" autocomplete="name"></label>
<label>Email<input name="email" aria-label="Email" aria-describedby="email-help" type="email" required maxlength="254" autocomplete="email"><small id="email-help">We’ll email a thank-you receipt and a link to claim your submission to an account with this email address.</small></label>
<label>Team or organization<input name="organization_name" required maxlength="255" autocomplete="organization"></label>
<label>Teammate’s email<input name="teammate_email" aria-label="Teammate’s email" type="email" required maxlength="254" autocomplete="off"><small>${teammateInvitationNotice}</small></label>
<label>Presentation title<input name="title" required maxlength="200"></label>
<label>What will you present?<textarea name="summary" required maxlength="5000" rows="5"></textarea></label>
<div class="trap" aria-hidden="true"><label>Leave empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
<p><small>${claimRecommendation} Sign in or create an account using the email address above and verify it to claim. No account is required to submit.</small></p>
<p><small>Your contact details and proposal are private to event organizers. Applications are deleted 90 days after the event. Contact julian@codecollective.us to withdraw or request deletion.</small></p><button type="submit">Submit application</button></form>`));
 });
 app.post('/:id/presentations/apply',async c=>{
  if(!c.req.header('content-type')?.startsWith('application/x-www-form-urlencoded'))throw new HTTPException(415);
  const reader=c.req.raw.body?.getReader();if(!reader)throw new HTTPException(400);
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw new HTTPException(413)}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  const body=new URLSearchParams(new TextDecoder().decode(bytes));
  if(body.get('website'))throw new HTTPException(400,{message:'Unable to submit'});
  const fields=['contact_name','email','organization_name','title','summary'] as const,limits=[200,254,255,200,5000];
  const values=fields.map((field,i)=>{const value=(body.get(field)||'').trim();if(!value||value.length>limits[i])throw new HTTPException(400,{message:'Please complete all fields within the stated limits'});return value});
  values[1]=values[1].toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[1]))throw new HTTPException(400,{message:'Enter a valid email address'});
  const teammate=(body.get('teammate_email')||'').trim().toLowerCase();
  if(teammate.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teammate)||teammate===values[1])throw new HTTPException(400,{message:'Include a teammate’s email address that is different from your own.'});
  const e=await event(c.env.DB,c.req.param('id'));
  const id=crypto.randomUUID();
  const result=await c.env.DB.prepare(`INSERT INTO event_guest_presentations(id,event_id,contact_name,email,organization_name,title,summary,teammate_email,created_at,expires_at)
   SELECT ?,e.id,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ',COALESCE(e.ends_at,e.starts_at),'+90 days') FROM events e
   WHERE e.id=? AND julianday(e.starts_at)>julianday('now') AND EXISTS(SELECT 1 FROM event_presentation_forms WHERE event_id=e.id AND enabled=1)
   AND (SELECT COUNT(*) FROM event_guest_presentations WHERE event_id=e.id AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hour'))<100
   AND (SELECT COUNT(*) FROM event_guest_presentations WHERE event_id=e.id AND email=? AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hour'))<3
   AND (SELECT COUNT(*) FROM event_guest_presentations WHERE email=? AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'))<10`)
   .bind(id,...values,teammate,e.id,values[1],values[1]).run();
  if(!result.meta.changes)return c.html(document('Unable to submit','<h1>Unable to submit</h1><p>Applications are closed or the submission limit has been reached. Please try again later.</p>'),409);
  try{await sendGuestAcknowledgement(c.env,e,id,values[1])}catch{/* The application is already saved; receipt shows unconfirmed email status. */}
  return c.redirect(`apply/received?submission=${encodeURIComponent(id)}`,303);
 });
 app.get('/:id/presentations/apply/received',async c=>{
  const id=c.req.query('submission')||'';
  const row=await c.env.DB.prepare("SELECT acknowledgement_status FROM event_guest_presentations WHERE id=? AND event_id=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(id,c.req.param('id')).first<{acknowledgement_status:string}>();
  const delivery=row?.acknowledgement_status==='accepted'?'A thank-you email with a claim link has been accepted for sending to the address you supplied.':row?'Your application is saved, but we could not confirm the thank-you email was sent. You can still claim it below; please do not submit again.':'';
  return c.html(document('Application received',`<h1>Thank you</h1><p>Your application has been sent to the event organizers for review.</p><p>${delivery}</p><p>${claimRecommendation}</p><p>${teammateInvitationNotice}</p>${row?`<p><a href="${escapeHtml(guestClaimPath(c.req.param('id'),id))}">Claim your submission</a></p><p>Sign in or create an account using the same email address you supplied, then verify that address. Your application is already saved. Claiming creates the team organization and invites the teammate you supplied.</p>`:''}`));
 });
 app.get('/:id/presentations/guest/:submission',async c=>{
  const user=await auth(c.env,c.req.raw);
  const row=await guestClaimApplication(c.env.DB,c.req.param('id'),c.req.param('submission'),user);
  return c.json({application:{id:row.id,eventId:row.event_id,contactName:row.contact_name,email:row.email,organizationName:row.organization_name,title:row.title,summary:row.summary,teammateEmail:row.teammate_email,organizationId:row.organization_id,teamReady:!!row.organization_id,claimed:row.claimed_by_user_id===user.id}});
 });
 app.post('/:id/presentations/guest/:submission/claim',async c=>{
  const user=await auth(c.env,c.req.raw),eventId=c.req.param('id'),id=c.req.param('submission');
  const row=await guestClaimApplication(c.env.DB,eventId,id,user);
  const body=await c.req.json().catch(()=>null);
  if(body?.confirm!==true)throw new HTTPException(400,{message:'Confirm team creation and the teammate invitation.'});
  const teammate=String(body.teammateEmail||row.teammate_email||'').trim().toLowerCase();
  if(teammate.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teammate)||teammate===row.email)throw new HTTPException(400,{message:'Include a teammate’s email address that is different from your own.'});
  if(row.claimed_by_user_id===user.id){
   if(!row.teammate_email)await c.env.DB.prepare('UPDATE event_guest_presentations SET teammate_email=? WHERE id=? AND claimed_by_user_id=?').bind(teammate,id,user.id).run();
   return c.json({claimed:true,...await createGuestPresentationTeam(c.env,eventId,id,user)});
  }
  const result=await c.env.DB.prepare("UPDATE event_guest_presentations SET claimed_by_user_id=?,teammate_email=?,claimed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND event_id=? AND email=? AND claimed_by_user_id IS NULL AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(user.id,teammate,id,eventId,user.email!.trim().toLowerCase()).run();
  if(!result.meta.changes)throw new HTTPException(409,{message:'Application expired or was already claimed. Please reload.'});
  return c.json({claimed:true,...await createGuestPresentationTeam(c.env,eventId,id,user)});
 });
 app.get('/:id/presentations/guest-review',async c=>{
  const user=await auth(c.env,c.req.raw),e=await event(c.env.DB,c.req.param('id'));
  await authorizeOrganization(c.env.DB,{id:user.id,name:user.id,email:null,isOperator:false},'manage',e.host_org_id);
  const rows=await c.env.DB.prepare("SELECT id,contact_name,email,organization_name,title,summary,created_at,acknowledgement_status,claimed_at,teammate_email FROM event_guest_presentations WHERE event_id=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') ORDER BY created_at DESC LIMIT 200").bind(e.id).all();
  return c.json({submissions:rows.results});
 });
 return app;
}
