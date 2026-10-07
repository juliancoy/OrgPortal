export async function provisionEventChat(env: Env, eventId: string) {
  if (!env.CHAT_ORGANIZATION_ROOMS?.ensureEvent || env.ORGANIZATION_REPLICA_SOURCE) return false;
  const event = await env.DB.prepare('SELECT event_chat_room_id FROM events WHERE id = ?')
    .bind(eventId).first<{ event_chat_room_id: string | null }>();
  if (!event || event.event_chat_room_id) return Boolean(event?.event_chat_room_id);
  if (!await eventAllowsChat(env.DB, eventId)) return false;
  try {
    const room = await env.CHAT_ORGANIZATION_ROOMS.ensureEvent(eventId);
    await env.DB.prepare(`UPDATE events SET event_chat_room_id = ?,
      event_chat_room_name = title || ' comments' WHERE id = ? AND event_chat_room_id IS NULL`)
      .bind(room.id, eventId).run();
    return true;
  } catch {
    console.error('Event chat provisioning pending', eventId);
    return false;
  }
}

export async function provisionPendingEventChats(env: Env) {
  if (!env.CHAT_ORGANIZATION_ROOMS?.ensureEvent || env.ORGANIZATION_REPLICA_SOURCE) return;
  const pending = await env.DB.prepare(`SELECT e.id FROM events e
    LEFT JOIN organizations o ON o.id = e.host_org_id
    WHERE e.event_chat_room_id IS NULL AND ${eventChatEligibilitySql}
    ORDER BY e.created_at DESC LIMIT 50`).all<{ id: string }>();
  for (const event of pending.results || []) await provisionEventChat(env, event.id);
}
import { eventAllowsChat, eventChatEligibilitySql } from '../../shared/chatEligibility';
