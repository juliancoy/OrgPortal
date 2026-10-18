import { Hono } from 'hono';
import { base64Url, decodeBase64, emailFail, normalizeEmail } from './emailShared';
import { escapeHtml } from './emailTemplate';

type Contact = { email: string; organizationId: string };
async function key(env: Env) {
  const bytes = decodeBase64(env.EMAIL_CONTACT_UNSUBSCRIBE_KEY || '');
  if (bytes.length !== 32) emailFail(503, 'Email preferences are temporarily unavailable. Please reply to the sender for help.');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
// Opaque, authenticated tokens: no email address in a URL or public lookup API.
// No expiry: a recipient can opt out using an older invitation.
export async function contactUnsubscribeToken(env: Env, contact: Contact) {
  const email = normalizeEmail(contact.email);
  if (!email || !contact.organizationId || contact.organizationId.length > 200) emailFail(400, 'Invalid mailing contact.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('orgportal-contact-unsubscribe-v1')},await key(env),new TextEncoder().encode(JSON.stringify({email,organizationId:contact.organizationId})));
  return `${base64Url(iv)}.${base64Url(new Uint8Array(encrypted))}`;
}
async function readToken(env: Env, token: string): Promise<Contact> {
  const cryptoKey = await key(env);
  try {
    const [iv,data,extra] = token.split('.');
    if (!iv || !data || extra || token.length > 1800) throw new Error();
    const value = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decodeBase64(iv),additionalData:new TextEncoder().encode('orgportal-contact-unsubscribe-v1')},cryptoKey,decodeBase64(data))));
    if (!normalizeEmail(value.email) || normalizeEmail(value.email)!==value.email || typeof value.organizationId!=='string' || !value.organizationId || value.organizationId.length>200) throw new Error();
    return value;
  } catch { emailFail(400, 'This unsubscribe link is invalid. Please reply to the sender for help.'); }
}
function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — OrgPortal</title><style>*{box-sizing:border-box}body{font:16px/1.65 system-ui,sans-serif;margin:0;min-height:100svh;display:grid;place-items:center;background:#f1f8f9;color:#183b3a;padding:24px}main{width:100%;max-width:560px;padding:36px;background:white;border:1px solid #d7e9e8;border-radius:20px}h1{line-height:1.2;font-size:30px}button{font:inherit;background:#155e59;color:white;padding:12px 22px;border:0;border-radius:8px;cursor:pointer}a{color:#155e59}button:focus-visible,a:focus-visible{outline:3px solid #a36a00;outline-offset:4px}</style></head><body><main><p>OrgPortal · Email preferences</p><h1>${escapeHtml(title)}</h1>${body}<p><a href="mailto:events@codecollective.us">Contact the sender</a></p></main></body></html>`;
}
export function emailContactPreferences() {
  const routes = new Hono<{Bindings:Env}>();
  routes.use('*',async(c,next)=>{c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');c.header('X-Robots-Tag','noindex');c.header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");await next();});
  routes.onError((error,c)=>c.html(page('Unable to update email preferences','<p>This link is invalid or temporarily unavailable. Please contact the sender to unsubscribe.</p>'),400));
  routes.get('/',async c=>{
    const token=c.req.query('token') || '';
    const contact=await readToken(c.env,token);
    const group=await c.env.DB.prepare('SELECT name FROM organizations WHERE id=?').bind(contact.organizationId).first<{name:string}>();
    if(!group) emailFail(404,'Mailing group not found.');
    const existing=await c.env.DB.prepare('SELECT email FROM email_contact_suppressions WHERE organization_id=? AND email=?').bind(contact.organizationId,contact.email).first();
    return c.html(page(existing?'You are unsubscribed':'Unsubscribe from '+group.name,existing?'<p>Your preference is saved. You will no longer receive promotional emails from this group.</p>':`<p>Stop receiving invitations and announcements from ${escapeHtml(group.name)} at this email address. Your membership and event registrations will stay unchanged.</p><form method="post"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Unsubscribe</button></form>`));
  });
  routes.post('/',async c=>{
    const body=await c.req.parseBody().catch(()=>({})) as Record<string,unknown>;
    const contact=await readToken(c.env,c.req.query('token') || String(body.token || ''));
    if(!await c.env.DB.prepare('SELECT id FROM organizations WHERE id=?').bind(contact.organizationId).first())emailFail(404,'Mailing group not found.');
    const now=Date.now();
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO email_contact_suppressions(organization_id,email,unsubscribed_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(organization_id,email) DO UPDATE SET updated_at=excluded.updated_at`).bind(contact.organizationId,contact.email,now,now),
      c.env.DB.prepare(`UPDATE email_subscriptions SET status='unsubscribed',consent_source='recipient-unsubscribe',unsubscribed_at=COALESCE(unsubscribed_at,?),updated_at=? WHERE email=? AND ((topic_type='organization' AND topic_id=?) OR (topic_type='event' AND topic_id IN(SELECT id FROM events WHERE host_org_id=?)))`).bind(now,now,contact.email,contact.organizationId,contact.organizationId),
      c.env.DB.prepare(`UPDATE email_deliveries SET status='skipped',error='Recipient unsubscribed.' WHERE email=? AND kind='campaign' AND status='queued' AND campaign_id IN(SELECT id FROM email_campaigns WHERE organization_id=?)`).bind(contact.email,contact.organizationId),
    ]);
    return c.html(page('You are unsubscribed','<p>Your preference is saved. You will no longer receive promotional emails from this group. Your membership and event registrations are unchanged.</p>'));
  });
  return routes;
}
