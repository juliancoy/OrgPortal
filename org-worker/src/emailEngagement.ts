import { Hono } from 'hono';
import { base64Url, decodeBase64, emailPortalBase } from './emailShared';

const encoder = new TextEncoder();
async function key(env: Env) {
  if (!env.EMAIL_UNSUBSCRIBE_SECRET) throw new Error('Email signing is not configured');
  return crypto.subtle.importKey('raw', encoder.encode(env.EMAIL_UNSUBSCRIBE_SECRET), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);
}
function message(id: string, action: string, target: string) { return encoder.encode(JSON.stringify(['email-engagement-v1',id,action,target])); }
function safeTarget(target: string) {
  try { const url=new URL(target); return url.protocol==='https:' && !url.username && !url.password && target.length<=2048; } catch { return false; }
}
export async function engagementUrl(env: Env, id: string, action: 'open'|'click', target='') {
  if (action==='click' && !safeTarget(target)) throw new Error('Invalid campaign link');
  const signature=base64Url(new Uint8Array(await crypto.subtle.sign('HMAC',await key(env),message(id,action,target))));
  const url=new URL(`/api/org/api/email/engagement/${action}`,emailPortalBase(env));
  url.search=new URLSearchParams({id,sig:signature,...(target?{url:target}:{})}).toString();
  return url.toString();
}
export async function campaignEngagement(env: Env, campaignId: string) {
  return await env.DB.prepare(`SELECT COUNT(*) AS sent, COUNT(e.delivery_id) AS tracked,
    COUNT(e.opened_at) AS opened, COUNT(e.clicked_at) AS clicked, COUNT(e.unsubscribed_at) AS unsubscribed
    FROM email_deliveries d LEFT JOIN email_engagement e ON e.delivery_id=d.id AND e.expires_at>?
    WHERE d.campaign_id=? AND d.kind='campaign' AND d.status='sent'`).bind(Date.now(),campaignId).first();
}
export function emailEngagementRoutes() {
  const routes=new Hono<{Bindings:Env}>();
  routes.use('*',async(c,next)=>{c.header('Cache-Control','no-store, max-age=0');c.header('Referrer-Policy','no-referrer');c.header('X-Robots-Tag','noindex, nofollow');await next();});
  routes.get('/:action',async c=>{
    const action=c.req.param('action'),id=c.req.query('id')||'',target=c.req.query('url')||'',sig=c.req.query('sig')||'';
    let valid=false;
    if ((action==='open'||action==='click') && id.length>0 && id.length<=200 && sig.length<=100 && (action==='open'?target==='':safeTarget(target))) {
      try {valid=await crypto.subtle.verify('HMAC',await key(c.env),decodeBase64(sig),message(id,action,target));} catch { /* Invalid public capability. */ }
    }
    if (!valid) return c.html('<!doctype html><html><title>Invalid email link</title><body><h1>This email link is invalid</h1><p><a href="/email">Open Email</a> or <a href="mailto:events@codecollective.us">contact the sender</a>.</p></body></html>',404);
    // HEAD and explicit prefetches do not record engagement. Other automated loads
    // cannot reliably be distinguished from people; report these as estimates.
    if (c.req.method==='GET' && !/prefetch/i.test(c.req.header('Sec-Purpose')||c.req.header('Purpose')||'')) {
      const column=action==='open'?'opened_at':'clicked_at';
      try { await c.env.DB.prepare(`UPDATE email_engagement SET ${column}=COALESCE(${column},?)
        WHERE delivery_id=? AND expires_at>? AND EXISTS(SELECT 1 FROM email_deliveries d
          WHERE d.id=delivery_id AND d.kind='campaign' AND d.status IN ('sending','sent'))`)
        .bind(Date.now(),id,Date.now()).run();
      } catch { /* Analytics failure must not prevent visiting the signed destination. */ }
    }
    // Signed destinations remain usable after analytics have expired or been erased.
    if(action==='click')return c.redirect(target,302);
    c.header('Content-Type','image/gif');
    return c.body(decodeBase64('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'));
  });
  return routes;
}
