import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { finishGoogleConnection, senderFor, startGoogleConnection } from './emailGoogle';
import { digest, emailDailyLimit, emailFail, emailPortalBase, googleConfig, unsubscribeUrl, verifyUnsubscribe,
  type EmailActor, type EmailCampaign, type EmailEvent, type EmailSubscription } from './emailShared';
import { escapeHtml, renderCampaign } from './emailTemplate';

type GetActor = (env: Env, request: Request) => Promise<EmailActor>;
async function ownCampaign(env: Env, id: string, ownerId: string) {
  const row = await env.DB.prepare('SELECT * FROM email_campaigns WHERE id = ? AND owner_user_id = ?').bind(id, ownerId).first<EmailCampaign>();
  if (!row) emailFail(404, 'Campaign not found.');
  return row;
}
async function audience(env: Env, event: EmailEvent, kind: string, selected: unknown) {
  const type = kind === 'event' ? 'event' : 'organization';
  const topicId = type === 'event' ? event.id : event.host_org_id;
  const rows = await env.DB.prepare("SELECT * FROM email_subscriptions WHERE topic_type = ? AND topic_id = ? AND status = 'subscribed' ORDER BY email LIMIT 1001")
    .bind(type, topicId).all<EmailSubscription>();
  if ((rows.results || []).length > 1000) emailFail(400, 'Use an audience of 1,000 or fewer subscribers for this sender.');
  if (kind !== 'selected') return rows.results || [];
  if (!Array.isArray(selected) || selected.length > 1000 || selected.some((id) => typeof id !== 'string')) emailFail(400, 'Select subscribers for this campaign.');
  const ids = new Set(selected);
  const result = (rows.results || []).filter((row) => ids.has(row.id));
  if (result.length !== ids.size) emailFail(400, 'A selected contact is no longer subscribed to this organization.');
  return result;
}
async function campaignPreview(env: Env, campaign: EmailCampaign) {
  const deliveries = await env.DB.prepare(`SELECT d.id, d.email, d.name, d.status, d.kind, d.error, d.gmail_message_id,
    d.sent_at, d.subscription_id, COALESCE(s.status, 'unsubscribed') AS subscription_status
    FROM email_deliveries d LEFT JOIN email_subscriptions s ON s.id = d.subscription_id WHERE d.campaign_id = ? ORDER BY d.kind, d.email, d.id`)
    .bind(campaign.id).all<Record<string, unknown>>();
  const rows = deliveries.results || [];
  const eligible = rows.filter((row) => row.kind === 'campaign' && row.subscription_status === 'subscribed');
  const fingerprint = await digest(JSON.stringify([
    campaign.id, campaign.owner_user_id, campaign.sender_email, campaign.organization_id, campaign.event_id,
    campaign.event_json, campaign.audience, campaign.subject, campaign.body, campaign.scheduled_at,
    eligible.map((row) => [row.id, row.email]),
  ]));
  const counts: Record<string, number> = {};
  for (const row of rows.filter((row) => row.kind === 'campaign')) counts[String(row.status)] = (counts[String(row.status)] || 0) + 1;
  return { ...campaign, preview: renderCampaign(env, campaign, 'Alex', null), fingerprint, recipient_count: eligible.length, counts, deliveries: rows };
}

export function emailRoutes(getUser: GetActor, getAdmin: GetActor) {
  const routes = new Hono<{ Bindings: Env }>();
  routes.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); c.header('Referrer-Policy', 'no-referrer'); await next(); });

  routes.get('/sender', async (c) => {
    const user = await getAdmin(c.env, c.req.raw);
    const sender = await senderFor(c.env, user.id);
    let configured = true;
    try { googleConfig(c.env); emailPortalBase(c.env); await unsubscribeUrl(c.env, 'configuration-check'); if (!c.env.EMAIL_POSTAL_ADDRESS?.trim()) configured = false; } catch { configured = false; }
    const usage = await c.env.DB.prepare('SELECT count(*) AS n FROM email_send_attempts WHERE sender_user_id = ? AND attempted_at > ?')
      .bind(user.id, Date.now() - 86_400_000).first<{ n: number }>();
    return c.json({ configured, sending_enabled: c.env.EMAIL_SENDING_ENABLED === 'true', email: sender?.email || user.email,
      connected: sender?.status === 'connected', status: sender?.status || 'disconnected', cooldown_until: sender?.cooldown_until || 0,
      daily_limit: emailDailyLimit(c.env), used_today: Number(usage?.n || 0) });
  });
  routes.post('/google/connect', async (c) => {
    const user = await getAdmin(c.env, c.req.raw);
    const result = await startGoogleConnection(c.env, user);
    setCookie(c, '__Host-portal-email-oauth', result.browser, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 600 });
    return c.json({ url: result.url });
  });
  routes.get('/google/callback', async (c) => {
    const browser = getCookie(c, '__Host-portal-email-oauth') || '';
    deleteCookie(c, '__Host-portal-email-oauth', { secure: true, httpOnly: true, sameSite: 'Lax', path: '/' });
    if (c.req.query('error')) return c.redirect(`${emailPortalBase(c.env)}/email?connection=cancelled`);
    await finishGoogleConnection(c.env, c.req.query('state') || '', browser, c.req.query('code') || '');
    return c.redirect(`${emailPortalBase(c.env)}/email?connection=connected`);
  });
  routes.delete('/sender', async (c) => {
    const user = await getAdmin(c.env, c.req.raw);
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE email_campaigns SET status = 'paused' WHERE owner_user_id = ? AND status = 'queued'").bind(user.id),
      c.env.DB.prepare('DELETE FROM email_senders WHERE owner_user_id = ?').bind(user.id),
      c.env.DB.prepare('DELETE FROM email_oauth_states WHERE owner_user_id = ?').bind(user.id),
    ]);
    return c.json({ connected: false });
  });

  routes.get('/subscriptions/me', async (c) => {
    const user = await getUser(c.env, c.req.raw);
    const rows = await c.env.DB.prepare(`SELECT s.id, s.topic_type, s.topic_id, s.status,
      CASE s.topic_type WHEN 'event' THEN e.title ELSE o.name END AS topic_name
      FROM email_subscriptions s LEFT JOIN events e ON s.topic_type = 'event' AND e.id = s.topic_id
      LEFT JOIN organizations o ON s.topic_type = 'organization' AND o.id = s.topic_id WHERE s.user_id = ? ORDER BY s.updated_at DESC`)
      .bind(user.id).all();
    return c.json(rows.results || []);
  });
  routes.put('/subscriptions/:id', async (c) => {
    const user = await getUser(c.env, c.req.raw);
    const payload = await c.req.json().catch(() => ({})) as { subscribed?: unknown };
    if (typeof payload.subscribed !== 'boolean') emailFail(400, 'Choose an email preference.');
    const row = await c.env.DB.prepare(`UPDATE email_subscriptions SET status = ?, consent_source = 'account-preferences', updated_at = ?
      WHERE id = ? AND user_id = ? RETURNING id`).bind(payload.subscribed ? 'subscribed' : 'unsubscribed', Date.now(), c.req.param('id'), user.id).first();
    if (!row) emailFail(404, 'Subscription not found.');
    return c.json({ ok: true });
  });
  routes.get('/unsubscribe', async (c) => {
    const token = c.req.query('token') || '';
    const id = await verifyUnsubscribe(c.env, token);
    const subscription = await c.env.DB.prepare('SELECT status FROM email_subscriptions WHERE id = ?').bind(id).first<{ status: string }>();
    if (!subscription) emailFail(404, 'Subscription not found.');
    c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
    return c.html(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Email preferences</title></head><body style="font:18px/1.6 system-ui;max-width:600px;margin:60px auto;padding:20px"><h1>Email preferences</h1>${subscription.status === 'unsubscribed' ? '<p>You are unsubscribed from these emails.</p>' : `<p>Stop receiving emails for this event or organization?</p><form method="post"><input type="hidden" name="token" value="${escapeHtml(token)}"><button style="font:inherit;padding:12px 20px">Unsubscribe</button></form>`}</body></html>`);
  });
  routes.post('/unsubscribe', async (c) => {
    const data = await c.req.parseBody().catch(() => ({})) as Record<string, unknown>;
    const id = await verifyUnsubscribe(c.env, c.req.query('token') || String(data.token || ''));
    const result = await c.env.DB.prepare("UPDATE email_subscriptions SET status = 'unsubscribed', updated_at = ? WHERE id = ? RETURNING id").bind(Date.now(), id).first();
    if (!result) emailFail(404, 'Subscription not found.');
    return c.html('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsubscribed</title></head><body><h1>You are unsubscribed.</h1><p>Your event registration is unchanged.</p></body></html>');
  });

  routes.get('/audience/:eventId', async (c) => {
    await getAdmin(c.env, c.req.raw);
    const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(c.req.param('eventId')).first<EmailEvent>();
    if (!event?.host_org_id) emailFail(400, 'Choose an organization-hosted event.');
    const [eventRecipients, organizationRecipients] = await Promise.all([audience(c.env, event, 'event', null), audience(c.env, event, 'organization', null)]);
    return c.json({ event_count: eventRecipients.length, organization_count: organizationRecipients.length,
      contacts: organizationRecipients.map(({ id, name, email }) => ({ id, name, email })) });
  });
  routes.get('/campaigns', async (c) => {
    const user = await getAdmin(c.env, c.req.raw);
    const rows = await c.env.DB.prepare(`SELECT c.*, (SELECT count(*) FROM email_deliveries d WHERE d.campaign_id = c.id AND d.kind = 'campaign') AS recipient_count,
      (SELECT count(*) FROM email_deliveries d WHERE d.campaign_id = c.id AND d.kind = 'campaign' AND d.status = 'sent') AS sent_count
      FROM email_campaigns c WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 100`).bind(user.id).all();
    return c.json(rows.results || []);
  });
  routes.post('/campaigns', async (c) => {
    const user = await getAdmin(c.env, c.req.raw);
    const sender = await senderFor(c.env, user.id);
    if (sender?.status !== 'connected') emailFail(409, 'Connect your Google sender account first.');
    const payload = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
    const body = typeof payload.body === 'string' ? payload.body.trim() : '';
    const kind = String(payload.audience || 'event');
    if (!subject || subject.length > 200 || /[\r\n\0]/.test(subject) || !body || body.length > 20_000 || !['event', 'organization', 'selected'].includes(kind)) emailFail(400, 'Enter a subject, message, and valid audience.');
    const event = await c.env.DB.prepare(`SELECT e.*, o.name AS organization_name FROM events e LEFT JOIN organizations o ON o.id = e.host_org_id WHERE e.id = ?`)
      .bind(String(payload.event_id || '')).first<EmailEvent>();
    if (!event?.host_org_id) emailFail(400, 'Choose an organization-hosted event.');
    const scheduled = payload.scheduled_at ? Date.parse(String(payload.scheduled_at)) : Date.now();
    if (!Number.isFinite(scheduled) || scheduled < Date.now() - 60_000 || scheduled > Date.now() + 365 * 86_400_000) emailFail(400, 'Choose a future send time within one year.');
    const recipients = await audience(c.env, event, kind, payload.selected_ids);
    const campaign: EmailCampaign = { id: crypto.randomUUID(), owner_user_id: user.id, sender_email: sender.email,
      organization_id: event.host_org_id, event_id: event.id, event_json: JSON.stringify(event), audience: kind, subject, body,
      status: 'draft', scheduled_at: scheduled, created_at: Date.now() };
    renderCampaign(c.env, campaign, 'Alex', null);
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO email_campaigns (id, owner_user_id, sender_email, organization_id, event_id, event_json, audience, subject, body, status, scheduled_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
        .bind(campaign.id, user.id, sender.email, campaign.organization_id, event.id, campaign.event_json, kind, subject, body, scheduled, campaign.created_at),
      c.env.DB.prepare(`INSERT INTO email_deliveries (id, campaign_id, sender_user_id, subscription_id, email, name, kind, status)
        SELECT lower(hex(randomblob(16))), ?, ?, s.id, s.email, s.name, 'campaign', 'draft' FROM email_subscriptions s
        WHERE s.status = 'subscribed' AND s.id IN (SELECT value FROM json_each(?))`)
        .bind(campaign.id, user.id, JSON.stringify(recipients.map((person) => person.id))),
    ]);
    return c.json(await campaignPreview(c.env, campaign), 201);
  });
  routes.get('/campaigns/:id', async (c) => {
    const user = await getAdmin(c.env, c.req.raw);
    return c.json(await campaignPreview(c.env, await ownCampaign(c.env, c.req.param('id'), user.id)));
  });
  routes.post('/campaigns/:id/test', async (c) => {
    const user = await getAdmin(c.env, c.req.raw);
    const campaign = await ownCampaign(c.env, c.req.param('id'), user.id);
    const sender = await senderFor(c.env, user.id);
    if (c.env.EMAIL_SENDING_ENABLED !== 'true' || sender?.status !== 'connected' || sender.email !== campaign.sender_email) emailFail(409, 'Email sending is not enabled or the sender needs reconnecting.');
    const pending = await c.env.DB.prepare("SELECT id FROM email_deliveries WHERE campaign_id = ? AND kind = 'test' AND status IN ('queued', 'sending')").bind(campaign.id).first();
    if (pending) emailFail(409, 'A test email is already queued.');
    const recent = await c.env.DB.prepare("SELECT count(*) AS n FROM email_deliveries d WHERE d.sender_user_id = ? AND d.kind = 'test' AND d.created_at > ?")
      .bind(user.id, Date.now() - 86_400_000).first<{ n: number }>();
    if (Number(recent?.n || 0) >= 20) emailFail(429, 'The daily test-email limit has been reached.');
    const inserted = await c.env.DB.prepare(`INSERT INTO email_deliveries (id, campaign_id, sender_user_id, email, name, kind, status)
      SELECT ?, ?, ?, ?, ?, 'test', 'queued' WHERE
        (SELECT count(*) FROM email_deliveries WHERE sender_user_id = ? AND kind = 'test' AND created_at > ?) < 20
      ON CONFLICT DO NOTHING RETURNING id`)
      .bind(crypto.randomUUID(), campaign.id, user.id, sender.email, user.full_name || 'Alex', user.id, Date.now() - 86_400_000).first();
    if (!inserted) emailFail(409, 'A test is already pending or the daily test-email limit was reached.');
    return c.json({ queued: true, recipient: sender.email });
  });
  routes.post('/campaigns/:id/send', async (c) => {
    const user = await getAdmin(c.env, c.req.raw);
    const campaign = await ownCampaign(c.env, c.req.param('id'), user.id);
    const sender = await senderFor(c.env, user.id);
    if (c.env.EMAIL_SENDING_ENABLED !== 'true' || sender?.status !== 'connected' || sender.email !== campaign.sender_email) emailFail(409, 'Email sending is not enabled or the sender needs reconnecting.');
    if (campaign.status !== 'draft') emailFail(409, 'This campaign has already been queued.');
    const preview = await campaignPreview(c.env, campaign);
    const payload = await c.req.json().catch(() => ({})) as { fingerprint?: string };
    if (!payload.fingerprint || payload.fingerprint !== preview.fingerprint) emailFail(409, 'The audience changed. Refresh the preview before sending.');
    if (!preview.recipient_count) emailFail(400, 'No subscribed recipients are selected.');
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE email_campaigns SET status = 'queued', queued_at = ? WHERE id = ? AND status = 'draft'").bind(Date.now(), campaign.id),
      c.env.DB.prepare("UPDATE email_deliveries SET status = 'queued' WHERE campaign_id = ? AND kind = 'campaign' AND status = 'draft'").bind(campaign.id),
    ]);
    return c.json({ queued: true });
  });
  routes.post('/campaigns/:id/pause', async (c) => {
    const user = await getAdmin(c.env, c.req.raw);
    const campaign = await ownCampaign(c.env, c.req.param('id'), user.id);
    if (campaign.status !== 'queued') emailFail(409, 'Only a queued campaign can be paused.');
    await c.env.DB.prepare("UPDATE email_campaigns SET status = 'paused' WHERE id = ? AND status = 'queued'").bind(campaign.id).run();
    return c.json({ paused: true });
  });
  routes.post('/campaigns/:id/resume', async (c) => {
    const user = await getAdmin(c.env, c.req.raw);
    const campaign = await ownCampaign(c.env, c.req.param('id'), user.id);
    const sender = await senderFor(c.env, user.id);
    if (campaign.status !== 'paused' || sender?.status !== 'connected' || sender.email !== campaign.sender_email || c.env.EMAIL_SENDING_ENABLED !== 'true') emailFail(409, 'Reconnect the sender and enable sending before resuming this campaign.');
    await c.env.DB.prepare("UPDATE email_campaigns SET status = 'queued' WHERE id = ? AND status = 'paused'").bind(campaign.id).run();
    return c.json({ queued: true });
  });
  return routes;
}
