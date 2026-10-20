import { z } from 'zod';
import { type OrganizationActor } from '../organizationIam';
import { EventIntegrationError } from '../eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, previewFingerprint, claimEventOperation, finishEventOperation } from '../eventOperationStore';

export const ownershipReleaseSchema = z.object({
  organizationId: z.string().min(1).max(200),
  reason: z.enum(['incorrect_association', 'no_longer_representing']),
  confirm: z.boolean().optional(), previewId: z.string().uuid().optional(),
}).strict();
type ReleaseState = { id: string; slug: string; name: string; updated_at: string; ownership_id: string;
  owner_user_id: string; started_at: string; membership_updated_at: string };

// A correction of one's own authority, not an ownership transfer. Historical
// challenge records and configured portals require the existing managed process.
export async function releaseOrganizationOwnership(db: D1Database, actor: OrganizationActor, input: unknown) {
  const args = ownershipReleaseSchema.parse(input);
  await enforceEventRateLimit(db, actor.id);
  const before = await db.prepare(`SELECT o.id,o.slug,o.name,o.updated_at,own.id AS ownership_id,
      own.owner_user_id,own.started_at,m.updated_at AS membership_updated_at
    FROM organizations o JOIN organization_ownerships own ON own.organization_id=o.id AND own.status='active'
    JOIN organization_memberships m ON m.organization_id=o.id AND m.user_id=own.owner_user_id AND m.status='active' AND m.role='owner'
    WHERE o.id=? AND own.owner_user_id=?`).bind(args.organizationId, actor.id).first<ReleaseState>();
  if (!before) throw new EventIntegrationError(403, 'Only the current owner can release their own ownership');
  const challenge = await db.prepare('SELECT id FROM organization_ownership_challenges WHERE ownership_id=? LIMIT 1').bind(before.ownership_id).first();
  const portal = await db.prepare('SELECT id FROM group_sites WHERE home_org_slug=? LIMIT 1').bind(before.slug).first();
  if (challenge || portal) throw new EventIntegrationError(409, 'This organization has a portal or ownership challenge history; use a managed authority review');
  const others = await db.prepare(`SELECT count(*) AS count FROM organization_memberships WHERE organization_id=? AND status='active' AND user_id!=?`)
    .bind(before.id, actor.id).first<{ count: number }>();
  const effects = { directoryRecord: 'preserved', ownershipStatus: 'unclaimed', removedOwnerUserId: actor.id,
    ownMembership: 'inactive', otherMemberships: 'unchanged', otherActiveMembershipCount: others?.count || 0,
    transfersOwnership: false, createsPermissions: false, sendsEmail: false, audit: 'minimal authority history retained' };
  const preview = { operation: 'release_ownership', organizationId: before.id, reason: args.reason, before, effects };
  const owner = { userId: actor.id, organizationId: before.id, eventId: 'organization:release_ownership' };
  const fingerprint = await previewFingerprint(preview);
  if (!args.confirm) return { ...preview, ...await prepareEventOperation(db, owner, fingerprint) };
  if (!args.previewId) throw new EventIntegrationError(409, 'Request a preview first and supply its previewId');
  await claimEventOperation(db, owner, args.previewId, fingerprint);
  const auditId = crypto.randomUUID(), now = new Date().toISOString();
  try {
    const results = await db.batch([
      // This conditional audit insertion is the transaction's compare-and-swap
      // guard. Following writes only execute when it matched the reviewed state.
      db.prepare(`INSERT INTO audit_events(id,actor_user_id,action,resource_type,resource_id,subject_user_id,metadata_json,created_at)
        SELECT ?,?,'organization.ownership.released','organization',o.id,?,?,? FROM organizations o
        JOIN organization_ownerships own ON own.organization_id=o.id
        JOIN organization_memberships m ON m.organization_id=o.id AND m.user_id=own.owner_user_id
        WHERE o.id=? AND o.updated_at IS ? AND own.id=? AND own.owner_user_id=? AND own.status='active'
        AND m.role='owner' AND m.status='active' AND m.updated_at IS ?
        AND NOT EXISTS(SELECT 1 FROM organization_ownership_challenges WHERE ownership_id=own.id)
        AND NOT EXISTS(SELECT 1 FROM group_sites WHERE home_org_slug=o.slug)
        AND (SELECT count(*) FROM organization_memberships WHERE organization_id=o.id AND status='active' AND user_id!=?)=?`)
        .bind(auditId, actor.id, actor.id, JSON.stringify({ ownershipId: before.ownership_id, startedAt: before.started_at,
          endedAt: now, reason: args.reason, previewId: args.previewId }), now,
          before.id, before.updated_at, before.ownership_id, actor.id, before.membership_updated_at, actor.id, effects.otherActiveMembershipCount),
      db.prepare(`UPDATE organization_memberships SET role='member',status='inactive',pending_organizer=0,onboarding_group_site_id=NULL,updated_at=?
        WHERE organization_id=? AND user_id=? AND EXISTS(SELECT 1 FROM audit_events WHERE id=?)`).bind(now, before.id, actor.id, auditId),
      db.prepare(`DELETE FROM organization_ownerships WHERE id=? AND owner_user_id=? AND EXISTS(SELECT 1 FROM audit_events WHERE id=?)`)
        .bind(before.ownership_id, actor.id, auditId),
    ]);
    if (results[0].meta.changes !== 1) throw new EventIntegrationError(409, 'Authority changed; request a new preview');
    await finishEventOperation(db, args.previewId, true, ['release_ownership']);
    return { organizationId: before.id, previewId: args.previewId, effects };
  } catch (error) {
    await finishEventOperation(db, args.previewId, false, []);
    throw error;
  }
}
