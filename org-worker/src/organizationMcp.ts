import { organizationCreationConflict, organizationCreationIdentity } from './organizationCreation';
import { z } from 'zod';
import { authorizeOrganization, organizerAssignment, listOrganizationMembers, saveOrganizationMember, type OrganizationActor } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, previewFingerprint, claimEventOperation, finishEventOperation } from './eventOperationStore';

export const organizationCreateSchema = z.object({
  kind: z.enum(['organization','team']).optional(),
  name: z.string().trim().min(1).max(255), city: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(5000).optional(),
  source_url: z.string().url().optional(), image_url: z.string().url().optional(),
  tags: z.array(z.string().max(80)).max(40).optional(),
  acknowledgeOwnership: z.literal(true).optional(),
  previewId: z.string().uuid().optional(), confirm: z.boolean().optional(),
}).strict();
export const organizationMemberSchema = z.object({
  organizationId: z.string().min(1).max(200), user_id: z.string().min(1).max(200),
  user_name: z.string().max(255).optional(), user_email: z.string().email().optional(),
  role: z.enum(['member', 'administrator']), add_only: z.boolean().optional(),
  previewId: z.string().uuid().optional(), confirm: z.boolean().optional(),
}).strict();
export type CreateOrganization = (actor: OrganizationActor, payload: Record<string, unknown>) => Promise<unknown>;

export async function runOrganizationOperation(db: D1Database, identity: { userId: string; scopes: string[] },
  operation: 'create' | 'member' | 'members' | 'list', input: unknown, create: CreateOrganization) {
  const write = operation === 'create' || operation === 'member';
  if (!identity.scopes.includes('org:portal.read') || (write && !identity.scopes.includes('org:portal.write'))) {
    throw new EventIntegrationError(403, 'Missing portal scope');
  }
  const actor = { id: identity.userId, name: identity.userId, email: null, isOperator: false };
  await enforceEventRateLimit(db, actor.id);
  if (operation === 'list') {
    const args = z.object({ limit: z.number().int().min(1).max(500).default(100) }).strict().parse(input);
    const rows = await db.prepare(`SELECT o.id, o.name, o.slug, m.role FROM organizations o
      JOIN organization_memberships m ON m.organization_id = o.id
      WHERE m.user_id = ? AND m.status = 'active' ORDER BY lower(o.name) LIMIT ?`).bind(actor.id, args.limit).all();
    return { organizations: rows.results };
  }
  if (operation === 'members') {
    const args = z.object({ organizationId: z.string().min(1).max(200) }).strict().parse(input);
    return { members: await listOrganizationMembers(db, args.organizationId, actor) };
  }
  const args = operation === 'create' ? organizationCreateSchema.parse(input) : organizationMemberSchema.parse(input);
  const { confirm, previewId, ...changes } = args;
  let organizationId: string;
  let before: unknown;
  if (operation === 'create') {
    const fields = changes as z.infer<typeof organizationCreateSchema>;
    const key = organizationCreationIdentity(fields);
    const existing = await db.prepare(`SELECT id FROM organizations WHERE ${organizationCreationConflict} LIMIT 1`)
      .bind(key.name, key.city, key.sourceUrl, key.sourceUrl).first();
    if (existing) throw new EventIntegrationError(409, 'Organization already exists; manage its existing portal instead');
    organizationId = `new:${await previewFingerprint(changes)}`;
    before = null;
  } else {
    organizationId = (changes as z.infer<typeof organizationMemberSchema>).organizationId;
    await authorizeOrganization(db, actor, 'manage', organizationId);
    before = await listOrganizationMembers(db, organizationId, actor);
  }
  const member = changes as z.infer<typeof organizationMemberSchema>;
  const assignment = operation === 'member' && member.role === 'administrator'
    ? await organizerAssignment(db, organizationId, member.user_id) : null;
  const effects = operation === 'create' ? { ownershipStatus: 'claimed', ownerUserId: actor.id, createsOwnership: true, createsMembership: true, membershipRole: 'owner', verifiesLegalRepresentation: false, publicRecord: true, requiresOwnershipAcknowledgement: true } : null;
  const preview = { operation, organizationId, changes, before, assignment, effects };
  const owner = { userId: actor.id, organizationId, eventId: `organization:${operation}` };
  const fingerprint = await previewFingerprint(preview);
  if (!confirm) return { ...preview, ...await prepareEventOperation(db, owner, fingerprint) };
  if (!previewId) throw new EventIntegrationError(409, 'Request a preview first and supply its previewId');
  if (operation === 'create' && (args as z.infer<typeof organizationCreateSchema>).acknowledgeOwnership !== true)
    throw new EventIntegrationError(400, 'Owned creation grants you ownership. Use directory registration for a third-party listing, or preview again with acknowledgeOwnership=true');
  await claimEventOperation(db, owner, previewId, fingerprint);
  try {
    const result = operation === 'create' ? await create(actor, changes)
      : await saveOrganizationMember(db, organizationId, actor, changes, new Date().toISOString());
    await finishEventOperation(db, previewId, true, [operation]);
    return { result, previewId, effects };
  } catch (error) {
    await finishEventOperation(db, previewId, false, []);
    throw error;
  }
}
