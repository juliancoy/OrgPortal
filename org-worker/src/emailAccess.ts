import { emailFail, type EmailActor } from './emailShared';

export async function requireEmailOrganizer(env: Env, user: EmailActor, organizationId?: string) {
  const membership = await env.DB.prepare(`SELECT organization_id FROM organization_memberships
    WHERE user_id=? AND status='active' AND role IN ('owner','administrator')
      AND (? IS NULL OR organization_id=?) LIMIT 1`)
    .bind(user.id, organizationId || null, organizationId || null).first();
  if (!membership) emailFail(403, 'Active organizer access to this group is required.');
}

// No addresses, message contents, subscriber selections, or credentials in audit rows.
export function emailAudit(env: Env, userId: string, organizationId: string, action: string, targetId: string | null = null, count = 0) {
  const now = Date.now();
  return env.DB.prepare(`INSERT INTO email_mailing_audit
    (id,organization_id,actor_user_id,action,target_id,record_count,created_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),organizationId,userId,action,targetId,count,now,now+365*86_400_000);
}
