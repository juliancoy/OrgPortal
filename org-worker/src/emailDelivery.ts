import { syncSenderBounces } from './emailBounces';
import { googleAccessToken, sendGmail, type Sender } from './emailGoogle';
import { contactUnsubscribeToken } from './emailContactPreferences';
import { emailDailyLimit, emailPortalBase, type EmailCampaign } from './emailShared';
import { campaignMime } from './emailTemplate';

type Delivery = { id: string; campaign_id: string; subscription_id: string | null; email: string; name: string; kind: string; attempts: number };

/** D1 is the durable outbox; the existing minute cron drains it without a new queue binding. */
export async function runEmailDelivery(env: Env) {
  const massEnabled=env.EMAIL_SENDING_ENABLED==='true';
  const start = Date.now();
  // Revocation stops already queued work, including test messages.
  await env.DB.prepare(`UPDATE email_deliveries SET status='skipped',error='Sender no longer has organizer access.'
    WHERE status='queued' AND campaign_id IN (SELECT c.id FROM email_campaigns c WHERE NOT EXISTS
      (SELECT 1 FROM organization_memberships m WHERE m.organization_id=c.organization_id AND m.user_id=c.owner_user_id
        AND m.status='active' AND m.role IN ('owner','administrator')))`).run();
  await env.DB.prepare(`UPDATE email_campaigns SET status='paused' WHERE status='queued' AND NOT EXISTS
    (SELECT 1 FROM organization_memberships m WHERE m.organization_id=email_campaigns.organization_id
      AND m.user_id=email_campaigns.owner_user_id AND m.status='active' AND m.role IN ('owner','administrator'))`).run();
  // Existing queued campaigns also require a completed self-test before dispatch.
  await env.DB.prepare(`UPDATE email_campaigns SET status='paused' WHERE status='queued' AND NOT EXISTS
    (SELECT 1 FROM email_deliveries t WHERE t.campaign_id=email_campaigns.id
      AND t.sender_user_id=email_campaigns.owner_user_id AND t.email=email_campaigns.sender_email
      AND t.kind='test' AND t.status='sent')`).run();
  const senders = await env.DB.prepare(`SELECT s.* FROM email_senders s WHERE s.status = 'connected'
    AND s.cooldown_until <= ? AND EXISTS (SELECT 1 FROM email_deliveries d JOIN email_campaigns c ON c.id = d.campaign_id
      WHERE d.sender_user_id = s.owner_user_id AND d.status = 'queued' AND d.next_attempt_at <= ?
      AND (d.kind = 'test' OR (c.status = 'queued' AND c.scheduled_at <= ? AND ?=1))) LIMIT 5`)
    .bind(start, start, start,massEnabled?1:0).all<Sender>();
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
      if(sender.can_read_bounces){try{await syncSenderBounces(env,sender,accessToken)}catch{continue}}
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
            AND (d.kind = 'test' OR (c.status = 'queued' AND c.scheduled_at <= ? AND ?=1))
          ORDER BY CASE d.kind WHEN 'test' THEN 0 ELSE 1 END, c.created_at, d.id LIMIT 1`)
          .bind(sender.owner_user_id, now, sender.email, now,massEnabled?1:0).first<Delivery>();
        if (!pending) break;
        const campaign = await env.DB.prepare('SELECT * FROM email_campaigns WHERE id = ?').bind(pending.campaign_id).first<EmailCampaign>();
        if (!campaign) break;
        if(campaign.report_only||(campaign.expires_at&&campaign.expires_at<=Date.now())){await env.DB.prepare("UPDATE email_campaigns SET status='paused' WHERE id=?").bind(campaign.id).run();break;}
        if(campaign.audience_mode==='outreach'){
          const used=await env.DB.prepare("SELECT count(*) n FROM email_deliveries WHERE campaign_id=? AND kind='campaign' AND status IN ('sent','sending','failed','uncertain')").bind(campaign.id).first<{n:number}>();
          if(pending.kind==='campaign'&&Number(used?.n||0)>=(campaign.batch_limit||50)){await env.DB.prepare("UPDATE email_campaigns SET status='paused' WHERE id=? AND status='queued'").bind(campaign.id).run();continue;}
        }
        // Check subscription again immediately before claiming; queued campaigns honor later unsubscribes.
        const subscription = pending.subscription_id ? await env.DB.prepare("SELECT id FROM email_subscriptions WHERE id = ? AND status = 'subscribed' AND email = ?")
          .bind(pending.subscription_id, pending.email).first() : null;
        const suppressed = await env.DB.prepare('SELECT email FROM email_contact_suppressions WHERE organization_id=? AND email=?').bind(campaign.organization_id,pending.email).first();
        const bounced=await env.DB.prepare('SELECT email FROM email_bounces WHERE organization_id=? AND email=?').bind(campaign.organization_id,pending.email).first();
        const reviewed=campaign.audience_mode==='outreach'?await env.DB.prepare("SELECT id FROM email_deliveries WHERE id=? AND review_status='approved' AND dns_status='mx_present'").bind(pending.id).first():subscription;
        if (pending.kind === 'campaign' && (!reviewed || suppressed || bounced)) {
          await env.DB.prepare("UPDATE email_deliveries SET status = 'skipped', error = 'Recipient held, unsubscribed or previously bounced.' WHERE id = ? AND status = 'queued'").bind(pending.id).run();
          continue;
        }
        // Render before the sending claim so a configuration error cannot look like an attempted delivery.
        const token = (pending.kind==='campaign'||campaign.audience_mode==='outreach') ? await contactUnsubscribeToken(env,{email:pending.email,organizationId:campaign.organization_id,deliveryId:pending.id}) : null;
        const unsubscribe = token ? new URL('/api/org/api/email/contact-unsubscribe?token='+encodeURIComponent(token),emailPortalBase(env)).toString() : null;
        const raw = await campaignMime(env, campaign, pending, unsubscribe);
        if(pending.kind==='campaign') await env.DB.prepare('INSERT INTO email_engagement(delivery_id,expires_at) VALUES(?,?) ON CONFLICT(delivery_id) DO NOTHING')
          .bind(pending.id,now+90*86_400_000).run();
        const claimed = await env.DB.prepare(`UPDATE email_deliveries SET status = 'sending', attempted_at = ?, attempts = attempts + 1, error = NULL
          WHERE id = ? AND status = 'queued' AND EXISTS (SELECT 1 FROM email_campaigns c WHERE c.id = campaign_id
            AND (kind = 'test' OR c.status = 'queued') AND EXISTS(SELECT 1 FROM organization_memberships m
              WHERE m.organization_id=c.organization_id AND m.user_id=c.owner_user_id AND m.status='active' AND m.role IN ('owner','administrator')))
            AND (kind='test' OR ((EXISTS(SELECT 1 FROM email_campaigns c WHERE c.id=campaign_id AND c.audience_mode='outreach' AND c.report_only=0 AND email_deliveries.review_status='approved' AND email_deliveries.dns_status='mx_present' AND (SELECT count(*) FROM email_deliveries used WHERE used.campaign_id=c.id AND used.kind='campaign' AND used.status IN ('sent','sending','failed','uncertain'))<c.batch_limit) OR EXISTS(SELECT 1 FROM email_subscriptions s WHERE s.id=subscription_id AND s.status='subscribed' AND s.email=email_deliveries.email)) AND NOT EXISTS(SELECT 1 FROM email_bounces b JOIN email_campaigns c ON c.organization_id=b.organization_id WHERE c.id=email_deliveries.campaign_id AND b.email=email_deliveries.email) AND NOT EXISTS(SELECT 1 FROM email_contact_suppressions x JOIN email_campaigns c ON c.organization_id=x.organization_id WHERE c.id=email_deliveries.campaign_id AND x.email=email_deliveries.email))) RETURNING id`)
          .bind(now, pending.id).first();
        if (!claimed) continue;
        await env.DB.prepare('INSERT INTO email_send_attempts (id, sender_user_id, attempted_at) VALUES (?, ?, ?)')
          .bind(crypto.randomUUID(), sender.owner_user_id, now).run();
        const result = await sendGmail(accessToken, raw);
        const retry = result.status === 'retry' && pending.attempts < 3;
        const status = retry ? 'queued' : result.status === 'retry' ? 'failed' : result.status;
        await env.DB.prepare(`UPDATE email_deliveries SET status = ?, gmail_message_id = ?, sent_at = ?, error = ?, next_attempt_at = ? WHERE id = ? AND status = 'sending'`)
          .bind(status, result.id || null, status === 'sent' ? Date.now() : null, result.error || null, retry ? Date.now() + 3_600_000 : 0, pending.id).run();
        if(result.status==='uncertain'){await env.DB.prepare("UPDATE email_campaigns SET status='paused' WHERE id=? AND status='queued'").bind(campaign.id).run();break;}
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
  await env.DB.prepare(`UPDATE email_campaigns SET status='paused' WHERE status='queued' AND audience_mode='outreach' AND (SELECT count(*) FROM email_deliveries d WHERE d.campaign_id=email_campaigns.id AND d.kind='campaign' AND d.status IN ('sent','sending','failed','uncertain'))>=batch_limit AND EXISTS(SELECT 1 FROM email_deliveries d WHERE d.campaign_id=email_campaigns.id AND d.kind='campaign' AND d.status='queued')`).run();
  await env.DB.prepare(`UPDATE email_campaigns SET status = 'completed' WHERE status = 'queued'
    AND NOT EXISTS (SELECT 1 FROM email_deliveries d WHERE d.campaign_id = email_campaigns.id AND d.kind = 'campaign' AND d.status IN ('queued', 'sending'))`).run();
  await env.DB.prepare('DELETE FROM email_send_attempts WHERE attempted_at < ?').bind(Date.now() - 30 * 86_400_000).run();
}
