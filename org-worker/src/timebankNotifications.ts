import { TimebankError } from './timebank';
import { enqueueUserPush, type PushDeliveryJob } from './push';

export type TimebankNotification = {
  id: string; user_id: string; community_id: string; type: string;
  actor_user_id: string; actor_user_name: string; entity_id: string;
  title: string; body: string; deep_link: string; created_at: string;
  status: 'unread' | 'read'; read_at: string | null;
};

export async function timebankNotifications(db: D1Database, userId: string, communityId: string, before?: string) {
  const [date, id] = (before || '').split('|');
  if (before && (before.length > 250 || !id || !Number.isFinite(Date.parse(date)))) throw new TimebankError('Invalid notification cursor.');
  const [items, total] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT * FROM user_notifications WHERE user_id = ? AND community_id = ?
      AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT 51`)
      .bind(userId, communityId, date || null, date || null, date || null, id || null),
    db.prepare("SELECT COUNT(*) AS unread_count FROM user_notifications WHERE user_id = ? AND community_id = ? AND status = 'unread'")
      .bind(userId, communityId),
  ]);
  const rows = items.results as TimebankNotification[];
  return { items: rows.slice(0, 50), unread_count: Number(total.results[0]?.unread_count || 0),
    next_cursor: rows.length > 50 ? `${rows[49].created_at}|${rows[49].id}` : null };
}

export async function markTimebankNotificationsRead(db: D1Database, userId: string, communityId: string, body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TimebankError('Provide notification IDs.');
  const ids = (body as { ids?: unknown }).ids;
  // Explicit IDs prevent a racing new notification from being marked read unseen.
  if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => typeof id !== 'string' || !id || id.length > 200)) throw new TimebankError('Choose up to 100 notification IDs.');
  if (!ids.length) return { changed: 0 };
  const result = await db.prepare(`UPDATE user_notifications SET status = 'read', read_at = ?
    WHERE user_id = ? AND community_id = ? AND status = 'unread' AND id IN (${ids.map(() => '?').join(',')})`)
    .bind(new Date().toISOString(), userId, communityId, ...ids).run();
  return { changed: result.meta.changes };
}

// A durable outbox: failed queue sends leave the committed inbox event available
// for the next scheduled attempt. Stable event IDs deduplicate push deliveries.
export async function dispatchTimebankPush(env: Env) {
  if (!env.PUSH_QUEUE || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await env.DB.prepare(`SELECT n.*, c.hostname FROM user_notifications n
    JOIN timebank_communities c ON c.id = n.community_id
    WHERE n.push_enqueued_at IS NULL AND n.status = 'unread' AND n.created_at > ?
    ORDER BY n.created_at, n.id LIMIT 100`).bind(cutoff).all<TimebankNotification & { hostname: string }>();
  for (const row of rows.results) {
    const job: PushDeliveryJob = { eventId: row.id, userId: row.user_id, title: row.title, body: row.body,
      deepLink: `https://${row.hostname}/p${row.deep_link}`,
      data: { notificationId: row.id, communityId: row.community_id, type: row.type, path: row.deep_link } };
    await enqueueUserPush(env, job);
    await env.DB.prepare('UPDATE user_notifications SET push_enqueued_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), row.id).run();
  }
}
