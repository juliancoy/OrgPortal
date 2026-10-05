export async function ensureOrganizationRoom(env: { DB: D1Database; CONTACTS_DB?: D1Database }, organizationId: string) {
  if (!env.CONTACTS_DB) throw new Error('Organization directory binding is not configured');
  const org = await env.CONTACTS_DB.prepare('SELECT id, name, slug FROM organizations WHERE id = ?')
    .bind(organizationId).first<{ id: string; name: string; slug: string }>();
  if (!org) throw new Error('Organization not found');
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
