import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { digest, emailFail, normalizeEmail, emailPortalBase } from './emailShared';

const legacyLifeTechOrganizationId = 'ef646755-9443-4c7b-ba4b-a7a29754f666';

// Public consent creates only an email subscription, never an identity or membership.
export function publicNewsletterRoutes() {
  const routes = new Hono<{ Bindings: Env }>();
  routes.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
  routes.use('*', bodyLimit({ maxSize: 2048 }));
  const subscribe = async (c: Context<{ Bindings: Env }>) => {
    const organizationId = c.req.param('organizationId') || legacyLifeTechOrganizationId;
    const origin = c.req.header('origin');
    if (!c.req.param('organizationId')) {
      if (origin !== 'https://lifetech.fyi') emailFail(403, 'Subscribe from the organization website.');
    } else {
      let hostname='';
      try { const parsed=new URL(origin || ''); if (parsed.protocol==='https:' || (parsed.protocol==='http:' && ['localhost','127.0.0.1'].includes(parsed.hostname))) hostname=parsed.hostname; } catch { /* Deny invalid origins. */ }
      const portalOrigin=new URL(emailPortalBase(c.env)).origin;
      const tenant=hostname ? await c.env.DB.prepare(`SELECT organization_id FROM group_sites WHERE hostname=? OR (custom_domain_hostname=? AND custom_domain_status='attached')`).bind(hostname,hostname).first<{organization_id:string}>() : null;
      if (!hostname || (origin!==portalOrigin && tenant?.organization_id!==organizationId)) emailFail(403,'Subscribe from this organization’s website or OrgPortal.');
    }
    if (!c.req.header('content-type')?.startsWith('application/json')) emailFail(400, 'Submit an email address.');
    const input = await c.req.json().catch(() => null);
    if (!input || typeof input !== 'object' || Array.isArray(input)) emailFail(400, 'Submit an email address.');
    const email = normalizeEmail(input.email);
    if (!email || input.consent !== true) emailFail(400, 'Enter a valid email and agree to receive the newsletter.');
    // Reuse the existing expiring rate-limit store; never retain a raw IP address.
    const now = Date.now(), window = Math.floor(now / 60000);
    const actor = 'newsletter:' + await digest(`${window}:${c.req.header('cf-connecting-ip') || 'unknown'}`);
    const allowed = await c.env.DB.prepare(`INSERT INTO event_mcp_rate_limits(actor_user_id,window_start,requests)
      VALUES(?,?,1) ON CONFLICT(actor_user_id) DO UPDATE SET requests=requests+1
      WHERE requests<5 RETURNING requests`).bind(actor, window).first();
    if (!allowed) { c.header('Retry-After', '60'); emailFail(429, 'Please wait a minute before trying again.'); }
    if (!await c.env.DB.prepare('SELECT id FROM organizations WHERE id=?').bind(organizationId).first()) emailFail(503, 'Newsletter signup is temporarily unavailable.');
    // An anonymous request must not reactivate an opt-out, clear a suppression,
    // or claim an existing account's preference. Duplicates have the same response.
    await c.env.DB.prepare(`INSERT INTO email_subscriptions
      (id,user_id,email,name,topic_type,topic_id,status,consent_source,updated_at,consented_at,unsubscribed_at)
      SELECT ?,? ,?,'Subscriber','organization',?,'subscribed','public-newsletter-form',?,?,NULL
      WHERE NOT EXISTS(SELECT 1 FROM email_contact_suppressions WHERE organization_id=? AND email=?)
      AND NOT EXISTS(SELECT 1 FROM email_bounces WHERE organization_id=? AND email=?)
      ON CONFLICT(email,topic_type,topic_id) DO NOTHING`)
      .bind(crypto.randomUUID(), '', email, organizationId, now, now, organizationId, email, organizationId, email).run();
    return c.json({ ok: true, message: 'Thank you! New email addresses are subscribed. If you previously unsubscribed, contact the newsletter sender to subscribe again.' });
  };
  routes.post('/',subscribe); // Existing LifeTech embeds remain compatible.
  routes.post('/:organizationId',subscribe);
  return routes;
}
