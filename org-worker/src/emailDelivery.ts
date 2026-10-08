import { googleAccessToken, sendGmail, type Sender } from './emailGoogle';
import { emailDailyLimit, type EmailCampaign, unsubscribeUrl } from './emailShared';
import { campaignMime } from './emailTemplate';

type Delivery = { id: string; campaign_id: string; subscription_id: string | null; email: string; name: string; kind: string; attempts: number };

/** D1 is the durable outbox; the existing minute cron drains it without a new queue binding. */
export async function runEmailDelivery(env: Env) {
  if (env.EMAIL_SENDING_ENABLED !== 'true') return;
  const start = Date.now();
  const senders = await env.DB.prepare(`SELECT s.* FROM email_senders s WHERE s.status = 'connected'
    AND s.cooldown_until <= ? AND EXISTS (SELECT 1 FROM email_deliveries d JOIN email_campaigns c ON c.id = d.campaign_id
      WHERE d.sender_user_id = s.owner_user_id AND d.status = 'queued' AND d.next_attempt_at <= ?
      AND (d.kind = 'test' OR (c.status = 'queued' AND c.scheduled_at <= ?))) LIMIT 5`)
    .bind(start, start, start).all<Sender>();
  // A crashed worker may have sent the message before recording the result. Never retry it automatically.
  await env.DB.prepare("UPDATE email_deliveries SET status = 'uncertain', error = 'Sending stopped before a result was recorded. Check Gmail Sent mail.' WHERE status = 'sending' AND attempted_at < ?")
    .bind(start - 180_000).run();
  for (const sender of senders.results || []) {
    if (Date.now() - start > 35_000) break;
    const lease = crypto.randomUUID();
    const locked = await env.DB.prepare('UPDATE email_senders SET lease_until = ?, lease_owner = ? WHERE owner_user_id = ? AND lease_until < ? RETURNING owner_user_id')
      .bind(Date.now() + 90_000, lease, sender.owner_user_id, Date.now()).first();
    if (!locked) continue;
    try {
      const accessToken = await googleAccessToken(env, sender);
      if (!accessToken) continue;
      for (let i = 0; i < 10 && Date.now() - start < 35_000; i++) {
        const now = Date.now();
        const active = await env.DB.prepare("SELECT owner_user_id FROM email_senders WHERE owner_user_id = ? AND status = 'connected' AND lease_owner = ? AND cooldown_until <= ?")
          .bind(sender.owner_user_id, lease, now).first();
        if (!active) break;
        const usage = await env.DB.prepare('SELECT count(*) AS n FROM email_send_attempts WHERE sender_user_id = ? AND attempted_at > ?')
          .bind(sender.owner_user_id, now - 86_400_000).first<{ n: number }>();
        if (Number(usage?.n || 0) >= emailDailyLimit(env)) break;
        const pending = await env.DB.prepare(`SELECT d.* FROM email_deliveries d JOIN email_campaigns c ON c.id = d.campaign_id
          WHERE d.sender_user_id = ? AND d.status = 'queued' AND d.next_attempt_at <= ? AND c.sender_email = ?
            AND (d.kind = 'test' OR (c.status = 'queued' AND c.scheduled_at <= ?))
          ORDER BY CASE d.kind WHEN 'test' THEN 0 ELSE 1 END, c.created_at, d.id LIMIT 1`)
          .bind(sender.owner_user_id, now, sender.email, now).first<Delivery>();
        if (!pending) break;
        const campaign = await env.DB.prepare('SELECT * FROM email_campaigns WHERE id = ?').bind(pending.campaign_id).first<EmailCampaign>();
        if (!campaign) break;
        // Check subscription again immediately before claiming; queued campaigns honor later unsubscribes.
        const subscription = pending.subscription_id ? await env.DB.prepare("SELECT id FROM email_subscriptions WHERE id = ? AND status = 'subscribed' AND email = ?")
          .bind(pending.subscription_id, pending.email).first() : null;
        if (pending.kind === 'campaign' && !subscription) {
          await env.DB.prepare("UPDATE email_deliveries SET status = 'skipped', error = 'Recipient unsubscribed.' WHERE id = ? AND status = 'queued'").bind(pending.id).run();
          continue;
        }
        // Render before the sending claim so a configuration error cannot look like an attempted delivery.
        const unsubscribe = pending.subscription_id ? await unsubscribeUrl(env, pending.subscription_id) : null;
        const raw = campaignMime(env, campaign, pending, unsubscribe);
        const claimed = await env.DB.prepare(`UPDATE email_deliveries SET status = 'sending', attempted_at = ?, attempts = attempts + 1, error = NULL
          WHERE id = ? AND status = 'queued' AND EXISTS (SELECT 1 FROM email_campaigns c WHERE c.id = campaign_id
            AND (kind = 'test' OR c.status = 'queued')) RETURNING id`)
          .bind(now, pending.id).first();
        if (!claimed) continue;
        await env.DB.prepare('INSERT INTO email_send_attempts (id, sender_user_id, attempted_at) VALUES (?, ?, ?)')
          .bind(crypto.randomUUID(), sender.owner_user_id, now).run();
        const result = await sendGmail(accessToken, raw);
        const retry = result.status === 'retry' && pending.attempts < 3;
        const status = retry ? 'queued' : result.status === 'retry' ? 'failed' : result.status;
        await env.DB.prepare(`UPDATE email_deliveries SET status = ?, gmail_message_id = ?, sent_at = ?, error = ?, next_attempt_at = ? WHERE id = ? AND status = 'sending'`)
          .bind(status, result.id || null, status === 'sent' ? Date.now() : null, result.error || null, retry ? Date.now() + 3_600_000 : 0, pending.id).run();
        if (result.reconnect) {
          await env.DB.prepare("UPDATE email_senders SET status = 'reconnect' WHERE owner_user_id = ? AND lease_owner = ?")
            .bind(sender.owner_user_id, lease).run();
          break;
        }
        if (result.status === 'retry') {
          await env.DB.prepare('UPDATE email_senders SET cooldown_until = ? WHERE owner_user_id = ? AND lease_owner = ?')
            .bind(Date.now() + 3_600_000, sender.owner_user_id, lease).run();
          break;
        }
      }
    } finally {
      await env.DB.prepare('UPDATE email_senders SET lease_until = 0, lease_owner = NULL WHERE owner_user_id = ? AND lease_owner = ?')
        .bind(sender.owner_user_id, lease).run();
    }
  }
  await env.DB.prepare(`UPDATE email_campaigns SET status = 'completed' WHERE status = 'queued'
    AND NOT EXISTS (SELECT 1 FROM email_deliveries d WHERE d.campaign_id = email_campaigns.id AND d.kind = 'campaign' AND d.status IN ('queued', 'sending'))`).run();
  await env.DB.prepare('DELETE FROM email_send_attempts WHERE attempted_at < ?').bind(Date.now() - 30 * 86_400_000).run();
}
