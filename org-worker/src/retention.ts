// Bounded cleanup of explicitly temporary records only. No account/content purge.
export async function runRetention(db: D1Database, now = Date.now(), dryRun = false) {
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error('Invalid retention clock');
  const cutoff = now - 23 * 3600_000; // hourly job leaves an hour to meet the 24h ceiling
  const rules: [string, string, string | number][] = [
    ['event_mcp_operations', "expires_at < ? AND status IN ('prepared','completed')", cutoff],
    ['event_mcp_rate_limits', 'window_start < ?', Math.floor(cutoff / 60000)],
    ['email_oauth_states', 'expires_at < ?', cutoff],
    ['private_newsletter_previews', 'expires_at < ?', new Date(cutoff).toISOString()],
    ['local_newsletter_previews', 'expires_at < ?', new Date(cutoff).toISOString()],
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
