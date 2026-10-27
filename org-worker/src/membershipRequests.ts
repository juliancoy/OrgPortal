import { HTTPException } from 'hono/http-exception';

export async function membershipRequestsAvailable(db: D1Database) {
  return Boolean(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='organization_membership_requests'").bind().first());
}

// Requests never grant membership. Managers approve through the existing IAM
// member preview/apply workflow; active members are excluded from the queue.
export async function requestMembership(db: D1Database, organizationId: string, userId: string, name: string, now = Date.now()) {
  if (!await membershipRequestsAvailable(db)) throw new HTTPException(503, { message: 'Membership requests are temporarily unavailable.' });
  await db.prepare(`INSERT INTO organization_membership_requests (organization_id,user_id,user_name,expires_at)
    VALUES (?,?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET
    user_name=excluded.user_name,expires_at=excluded.expires_at`)
    .bind(organizationId,userId,name.slice(0,255),now+30*86400_000).run();
}
export async function hasMembershipRequest(db: D1Database, organizationId: string, userId: string, now = Date.now()) {
  if (!await membershipRequestsAvailable(db)) return false;
  return Boolean(await db.prepare('SELECT user_id FROM organization_membership_requests WHERE organization_id = ? AND user_id = ? AND expires_at > ?').bind(organizationId,userId,now).first());
}
export async function membershipRequests(db: D1Database, organizationId: string, now = Date.now()) {
  if (!await membershipRequestsAvailable(db)) return [];
  const result = await db.prepare(`SELECT r.user_id,r.user_name FROM organization_membership_requests r
    WHERE r.organization_id = ? AND r.expires_at > ? AND NOT EXISTS
    (SELECT 1 FROM organization_memberships m WHERE m.organization_id=r.organization_id AND m.user_id=r.user_id AND m.status='active')
    ORDER BY r.expires_at,r.user_id`).bind(organizationId,now).all<{user_id:string;user_name:string|null}>();
  return result.results;
}
export async function removeMembershipRequest(db: D1Database, organizationId: string, userId: string) {
  if (!await membershipRequestsAvailable(db)) return;
  await db.prepare('DELETE FROM organization_membership_requests WHERE organization_id = ? AND user_id = ?').bind(organizationId,userId).run();
}
