// Bounded cleanup of explicitly temporary records only. No account/content purge.
export async function runRetention(db: D1Database, now = Date.now(), dryRun = false) {
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error('Invalid retention clock');
  const cutoff = now - 23 * 3600_000; // hourly job leaves an hour to meet the 24h ceiling
  const rules: [string, string, string | number][] = [
    ['organization_invitations', 'expires_at <= ?', now],
    ['organization_volunteer_awards', 'expires_at <= ?', new Date(now).toISOString()],
    ['event_presentation_submissions', 'expires_at < ?', new Date(cutoff).toISOString()],
    ['event_mcp_operations', "expires_at < ? AND status IN ('prepared','completed')", cutoff],
    ['event_mcp_rate_limits', 'window_start < ?', Math.floor(cutoff / 60000)],
    ['email_engagement', 'expires_at <= ?', now],
    ['email_bounce_receipts','expires_at <= ?',now],
    ['email_campaigns',"expires_at <= ? AND status IN ('draft','paused','completed')",now],
    ['email_campaign_previews', 'expires_at < ?', cutoff],
    ['email_segments', 'expires_at < ?', cutoff],
    ['email_mailing_audit', 'expires_at < ?', cutoff],
    ['email_oauth_states', 'expires_at < ?', cutoff],
    ['private_newsletter_previews', 'expires_at < ?', new Date(cutoff).toISOString()],
    ['local_newsletter_previews', 'expires_at < ?', new Date(cutoff).toISOString()],
    ['event_company_favorites', 'expires_at < ?', new Date(cutoff).toISOString()],
    ['organization_follow_event_jobs', 'expires_at < ?', new Date(now).toISOString()],
    ['user_notifications', "type = 'organization_event' AND created_at < ?", new Date(now - 90 * 86400_000).toISOString()],
    ['event_company_votes', 'expires_at < ?', new Date(cutoff).toISOString()],
  ];
  const counts: Record<string, number> = {};
  for (const [table, where, value] of rules) {
    if (dryRun) {
      const result = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).bind(value).first<{n:number}>();
      counts[table] = result?.n ?? 0;
    } else {
      const result = await db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} ORDER BY rowid LIMIT 500)`).bind(value).run();
      counts[table] = result.meta.changes;
    }
  }
  return counts;
}
