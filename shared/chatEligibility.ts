// Human-created organizations are claimed by their creator in the same flow.
// Imported source records and ordinary memberships do not establish ownership.
export const organizationChatEligibilitySql = `EXISTS (
  SELECT 1 FROM organization_ownerships own
  WHERE own.organization_id = o.id AND own.status = 'active'
    AND length(trim(own.owner_user_id)) > 0
)`;

export const eventChatEligibilitySql = `(
  (e.host_org_id IS NOT NULL AND ${organizationChatEligibilitySql})
  OR (e.host_org_id IS NULL AND length(trim(e.host_user_id)) > 0)
)`;

export async function organizationAllowsChat(db: D1Database, organizationId: string) {
  const eligible = await db.prepare(`SELECT o.id FROM organizations o
    WHERE o.id = ? AND ${organizationChatEligibilitySql}`)
    .bind(organizationId).first();
  return Boolean(eligible);
}

export async function eventAllowsChat(db: D1Database, eventId: string) {
  const eligible = await db.prepare(`SELECT e.id FROM events e
    LEFT JOIN organizations o ON o.id = e.host_org_id
    WHERE e.id = ? AND ${eventChatEligibilitySql}`)
    .bind(eventId).first();
  return Boolean(eligible);
}
