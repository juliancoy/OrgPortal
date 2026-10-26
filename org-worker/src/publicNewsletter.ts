import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { digest, emailFail, normalizeEmail } from './emailShared';

const organizationId = 'ef646755-9443-4c7b-ba4b-a7a29754f666';

// Public consent creates only an email subscription, never an identity or membership.
export function publicNewsletterRoutes() {
  const routes = new Hono<{ Bindings: Env }>();
  routes.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
  routes.use('*', bodyLimit({ maxSize: 2048 }));
  routes.post('/', async c => {
    const origin = c.req.header('origin');
    if (origin !== 'https://lifetech.fyi') emailFail(403, 'Subscribe from the LifeTech website.');
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
  });
  return routes;
}
