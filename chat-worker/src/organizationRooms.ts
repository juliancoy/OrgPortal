export async function ensureOrganizationRoom(env: { DB: D1Database; CONTACTS_DB?: D1Database }, organizationId: string) {
  if (!env.CONTACTS_DB) throw new Error('Organization directory binding is not configured');
  const org = await env.CONTACTS_DB.prepare('SELECT id, name, slug FROM organizations WHERE id = ?')
    .bind(organizationId).first<{ id: string; name: string; slug: string }>();
  if (!org) throw new Error('Organization not found');
  if (!await organizationAllowsChat(env.CONTACTS_DB, org.id)) {
    throw new HTTPException(403, { message: 'Claim this organization before opening its chat.' });
  }
  const id = `org-room-${org.id}`;
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO chat_conversations
    (id, kind, title, slug, created_by_user_id, org_id, created_at, updated_at)
    VALUES (?, 'org_room', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, slug = excluded.slug`)
    .bind(id, `${org.name} Chat`, org.slug, `organization:${org.id}`, org.id, now, now).run();
  const members = await env.CONTACTS_DB.prepare(`SELECT user_id, user_name, role
    FROM organization_memberships WHERE organization_id = ? AND status = 'active'`)
    .bind(org.id).all<{ user_id: string; user_name: string | null; role: string }>();
  const statements = (members.results || []).map(member => env.DB.prepare(`INSERT INTO chat_conversation_members
    (conversation_id, user_id, user_name, role, state, joined_at)
    VALUES (?, ?, ?, ?, 'active', ?)
    ON CONFLICT(conversation_id, user_id) DO UPDATE SET user_name = excluded.user_name,
      role = excluded.role,
      state = CASE WHEN chat_conversation_members.state = 'blocked' THEN 'blocked' ELSE 'active' END`)
    .bind(id, member.user_id, member.user_name, member.role === 'administrator' ? 'admin' : member.role, now));
  for (let offset = 0; offset < statements.length; offset += 50) await env.DB.batch(statements.slice(offset, offset + 50));
  return { id, organizationId: org.id };
}

// Only callable over the trusted service binding; event data comes from OrgPortal.
export async function ensureEventRoom(env: { DB: D1Database; CONTACTS_DB?: D1Database }, eventId: string) {
  if (!env.CONTACTS_DB) throw new Error('Event directory binding is not configured');
  const event = await env.CONTACTS_DB.prepare(
    'SELECT id, title, slug, host_org_id, host_user_id, event_chat_room_id FROM events WHERE id = ?',
  ).bind(eventId).first<{ id: string; title: string; slug: string; host_org_id: string | null;
    host_user_id: string | null; event_chat_room_id: string | null }>();
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  const existing = await env.DB.prepare("SELECT id FROM chat_conversations WHERE kind = 'event_room' AND event_id = ?")
    .bind(event.id).first<{ id: string }>();
  const id = existing?.id || `event-room-${event.id}`;
  if (!existing && !await eventAllowsChat(env.CONTACTS_DB, event.id)) {
    throw new HTTPException(403, { message: 'Claim the host organization before opening event comments.' });
  }
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO chat_conversations
    (id, kind, title, slug, created_by_user_id, org_id, event_id, created_at, updated_at)
    VALUES (?, 'event_room', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, slug = excluded.slug, org_id = excluded.org_id`)
    .bind(id, `${event.title} comments`, event.slug, event.host_user_id || `event:${event.id}`,
      event.host_org_id, event.id, now, now).run();
  return { id, eventId: event.id };
}
import { HTTPException } from 'hono/http-exception';
import { organizationAllowsChat, eventAllowsChat } from '../../shared/chatEligibility';
