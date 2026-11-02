import { z } from 'zod';
import type { OrganizationActor } from '../organizationIam';
import { EventIntegrationError } from '../eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, previewFingerprint, claimEventOperation, finishEventOperation } from '../eventOperationStore';

export const ownershipTransferSchema = z.object({
  organizationId: z.string().min(1).max(200),
  userId: z.string().min(1).max(200),
  reason: z.string().trim().min(5).max(500),
  confirm: z.boolean().optional(), previewId: z.string().uuid().optional(),
}).strict();
type State = { id: string; name: string; ownership_id: string; owner_user_id: string;
  organization_updated_at: string; owner_updated_at: string; target_updated_at: string; target_role: string;
  target_user_id: string; target_name: string | null };

// PIdP's live superadmin authority is supplied by REST/MCP, never by input.
// Targets must already have active organization membership under their stable ID.
export async function transferOrganizationOwnership(db: D1Database, actor: OrganizationActor, input: unknown) {
  if (!actor.isOperator) throw new EventIntegrationError(403, 'Superadmin access required');
  const args = ownershipTransferSchema.parse(input);
  await enforceEventRateLimit(db, actor.id);
  const before = await db.prepare(`SELECT o.id,o.name,o.updated_at AS organization_updated_at,
    own.id AS ownership_id,own.owner_user_id,old.updated_at AS owner_updated_at,
    target.user_id AS target_user_id,target.user_name AS target_name,target.role AS target_role,target.updated_at AS target_updated_at
    FROM organizations o
    JOIN organization_ownerships own ON own.organization_id=o.id AND own.status='active'
    JOIN organization_memberships old ON old.organization_id=o.id AND old.user_id=own.owner_user_id AND old.role='owner' AND old.status='active'
    JOIN organization_memberships target ON target.organization_id=o.id AND target.user_id=? AND target.status='active'
    WHERE o.id=?`).bind(args.userId, args.organizationId).first<State>();
  if (!before) throw new EventIntegrationError(409, 'Select an active member of an organization with a current owner');
  if (before.owner_user_id === args.userId) throw new EventIntegrationError(409, 'This member already owns the organization');
  const challenges = (await db.prepare("SELECT id FROM organization_ownership_challenges WHERE organization_id=? AND status='open' ORDER BY id")
    .bind(before.id).all<{ id: string }>()).results.map(row => row.id);
  const effects = { newOwnerUserId: args.userId, newOwnerRole: 'owner', previousOwnerUserId: before.owner_user_id,
    previousOwnerRole: 'member', otherMemberships: 'unchanged', directoryAndPortal: 'preserved',
    resolvedChallengeIds: challenges, sendsEmail: false };
  const preview = { operation: 'transfer_ownership', organizationId: before.id, reason: args.reason, before, effects };
  const owner = { userId: actor.id, organizationId: before.id, eventId: 'organization:transfer_ownership' };
  const fingerprint = await previewFingerprint(preview);
  if (!args.confirm) return { ...preview, ...await prepareEventOperation(db, owner, fingerprint) };
  if (!args.previewId) throw new EventIntegrationError(409, 'Request a preview first and supply its previewId');
  await claimEventOperation(db, owner, args.previewId, fingerprint);
  const auditId = crypto.randomUUID(), ownershipId = crypto.randomUUID(), now = new Date().toISOString();
  const guard = 'EXISTS(SELECT 1 FROM audit_events WHERE id=?)';
  try {
    const results = await db.batch([
      // All mutations share this compare-and-swap guard in one D1 transaction.
      db.prepare(`INSERT INTO audit_events(id,actor_user_id,action,resource_type,resource_id,subject_user_id,metadata_json,created_at)
        SELECT ?,?,'organization.ownership_transferred','organization',o.id,?,?,? FROM organizations o
        JOIN organization_ownerships own ON own.organization_id=o.id AND own.status='active'
        JOIN organization_memberships old ON old.organization_id=o.id AND old.user_id=own.owner_user_id
        JOIN organization_memberships target ON target.organization_id=o.id AND target.user_id=?
        WHERE o.id=? AND o.updated_at IS ? AND own.id=? AND own.owner_user_id=?
        AND old.role='owner' AND old.status='active' AND old.updated_at IS ?
        AND target.status='active' AND target.role=? AND target.updated_at IS ?
        AND (SELECT group_concat(id,',') FROM (SELECT id FROM organization_ownership_challenges WHERE organization_id=o.id AND status='open' ORDER BY id)) IS ?`)
        .bind(auditId, actor.id, args.userId, JSON.stringify({ previousOwnerUserId: before.owner_user_id,
          previousOwnershipId: before.ownership_id, ownershipId, reason: args.reason, previewId: args.previewId,
          resolvedChallengeIds: challenges, authority: 'superadmin' }), now,
          args.userId, before.id, before.organization_updated_at, before.ownership_id, before.owner_user_id,
          before.owner_updated_at, before.target_role, before.target_updated_at, challenges.join(',') || null),
      db.prepare(`UPDATE organization_ownerships SET status='transferred',ended_at=? WHERE id=? AND ${guard}`)
        .bind(now, before.ownership_id, auditId),
      db.prepare(`INSERT INTO organization_ownerships(id,organization_id,owner_user_id,status,started_at)
        SELECT ?,?,?,'active',? WHERE ${guard}`).bind(ownershipId, before.id, args.userId, now, auditId),
      db.prepare(`UPDATE organization_memberships SET role='member',updated_at=? WHERE organization_id=? AND user_id=? AND ${guard}`)
        .bind(now, before.id, before.owner_user_id, auditId),
      db.prepare(`UPDATE organization_memberships SET role='owner',pending_organizer=0,updated_at=? WHERE organization_id=? AND user_id=? AND ${guard}`)
        .bind(now, before.id, args.userId, auditId),
      db.prepare(`UPDATE organization_ownership_challenges SET status='resolved',resolution=CASE WHEN challenger_user_id=? THEN 'challenger' ELSE 'incumbent' END,
        resolved_by_user_id=?,resolved_at=? WHERE organization_id=? AND status='open' AND ${guard}`)
        .bind(args.userId, actor.id, now, before.id, auditId),
      db.prepare(`UPDATE organizations SET updated_at=? WHERE id=? AND ${guard}`).bind(now, before.id, auditId),
    ]);
    if (results[0].meta.changes !== 1) throw new EventIntegrationError(409, 'Authority changed; request a new preview');
    await finishEventOperation(db, args.previewId, true, ['transfer_ownership']);
    return { organizationId: before.id, previewId: args.previewId, ownershipId, effects };
  } catch (error) {
    await finishEventOperation(db, args.previewId, false, []);
    throw error;
  }
}
