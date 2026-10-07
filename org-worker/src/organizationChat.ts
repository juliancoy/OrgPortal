export async function provisionOrganizationChat(env: Env, organizationId: string) {
  if (!env.CHAT_ORGANIZATION_ROOMS || env.ORGANIZATION_REPLICA_SOURCE) return false;
  if (!await organizationAllowsChat(env.DB, organizationId)) return false;
  const job = await env.DB.prepare('SELECT generation FROM organization_chat_provisioning WHERE organization_id = ?')
    .bind(organizationId).first<{ generation: number }>();
  if (!job) return false;
  await env.DB.prepare(`UPDATE organization_chat_provisioning
    SET attempts = attempts + 1, last_attempt_at = ? WHERE organization_id = ?`)
    .bind(new Date().toISOString(), organizationId).run();
  try {
    const room = await env.CHAT_ORGANIZATION_ROOMS.ensure(organizationId);
    await env.DB.prepare(`UPDATE organization_chat_provisioning
      SET conversation_id = ?, completed_at = ? WHERE organization_id = ? AND generation = ?`)
      .bind(room.id, new Date().toISOString(), organizationId, job.generation).run();
    return true;
  } catch {
    console.error('Organization chat provisioning pending', organizationId);
    return false;
  }
}

export async function provisionPendingOrganizationChats(env: Env) {
  if (!env.CHAT_ORGANIZATION_ROOMS || env.ORGANIZATION_REPLICA_SOURCE) return;
  const pending = await env.DB.prepare(`SELECT p.organization_id
    FROM organization_chat_provisioning p
    JOIN organizations o ON o.id = p.organization_id
    WHERE p.completed_at IS NULL AND ${organizationChatEligibilitySql}
    ORDER BY p.last_attempt_at ASC,
      EXISTS(SELECT 1 FROM organization_memberships m WHERE m.organization_id = o.id AND m.status = 'active') DESC,
      o.id
    LIMIT 50`).all<{ organization_id: string }>();
  for (const row of pending.results || []) await provisionOrganizationChat(env, row.organization_id);
}
import { organizationAllowsChat, organizationChatEligibilitySql } from '../../shared/chatEligibility';
