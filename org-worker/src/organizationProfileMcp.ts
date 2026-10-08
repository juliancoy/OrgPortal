import { z } from 'zod';
import { authorizeOrganization } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, previewFingerprint, claimEventOperation, finishEventOperation, eventOperationStatus } from './eventOperationStore';

const target = z.object({ organizationId: z.string().min(1).max(200) }).strict();
const publicImage = z.string().max(1000).url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Image must be an HTTPS URL without credentials');
export const organizationProfileTargetSchema = target;
export const organizationProfileStatusSchema = target.extend({ previewId: z.string().uuid() });
export const organizationProfileUpdateSchema = target.extend({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  image_url: publicImage.nullable().optional(),
  city: z.string().trim().min(1).max(80).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  previewId: z.string().uuid().optional(), confirm: z.boolean().optional(),
}).strict();
const columns = ['name', 'description', 'image_url', 'city', 'tags', 'updated_at'] as const;
type ProfileRow = { id: string; slug: string; name: string; description: string | null; image_url: string | null; city: string | null; tags: string; updated_at: string };
function profile(row: ProfileRow) { return { ...row, tags: JSON.parse(row.tags || '[]') as string[] }; }

export async function runOrganizationProfileOperation(db: D1Database, identity: { userId: string; scopes: string[] },
  operation: 'get' | 'update' | 'status', input: unknown) {
  if (!identity.scopes.includes('org:portal.read') || (operation === 'update' && !identity.scopes.includes('org:portal.write')))
    throw new EventIntegrationError(403, 'Missing portal scope');
  const args = operation === 'update' ? organizationProfileUpdateSchema.parse(input)
    : operation === 'status' ? organizationProfileStatusSchema.parse(input) : target.parse(input);
  const actor = { id: identity.userId, name: identity.userId, email: null, isOperator: false };
  await enforceEventRateLimit(db, actor.id);
  await authorizeOrganization(db, actor, operation === 'get' ? 'read_members' : 'manage', args.organizationId);
  if (operation === 'status') return eventOperationStatus(db, actor.id, args.organizationId, (args as z.infer<typeof organizationProfileStatusSchema>).previewId);
  const before = await db.prepare(`SELECT id, slug, name, description, image_url, city, tags, updated_at FROM organizations WHERE id = ?`)
    .bind(args.organizationId).first<ProfileRow>();
  if (!before) throw new EventIntegrationError(404, 'Organization not found');
  if (operation === 'get') return { organization: profile(before) };
  const { organizationId, previewId, confirm, ...changes } = args as z.infer<typeof organizationProfileUpdateSchema>;
  if (!Object.keys(changes).length) throw new EventIntegrationError(400, 'Supply at least one profile field');
  const after = { ...before, ...changes, tags: changes.tags === undefined ? before.tags : JSON.stringify(changes.tags) };
  const preview = { organizationId, operation: 'profile', before: profile(before), after: profile(after), changes };
  const owner = { userId: actor.id, organizationId, eventId: 'organization:profile' };
  const fingerprint = await previewFingerprint(preview);
  if (!confirm) return { ...preview, ...await prepareEventOperation(db, owner, fingerprint) };
  if (!previewId) throw new EventIntegrationError(409, 'Request a preview first and supply its previewId');
  await claimEventOperation(db, owner, previewId, fingerprint);
  try {
    // Check profile state AND live management membership in the same atomic write.
    const result = await db.prepare(`UPDATE organizations SET name=?, description=?, image_url=?, city=?, tags=?, updated_at=?
      WHERE id=? AND ${columns.map(column => `${column} IS ?`).join(' AND ')}
      AND EXISTS (SELECT 1 FROM organization_memberships WHERE organization_id=? AND user_id=? AND status='active' AND role IN ('owner','administrator'))
      RETURNING id, slug, name, description, image_url, city, tags, updated_at`)
      .bind(after.name, after.description, after.image_url, after.city, after.tags, new Date().toISOString(), organizationId,
        ...columns.map(column => before[column]), organizationId, actor.id).first<ProfileRow>();
    if (!result) throw new EventIntegrationError(409, 'Profile or management permission changed; request a new preview');
    await finishEventOperation(db, previewId, true, ['profile']);
    return { organization: profile(result), previewId };
  } catch (error) {
    await finishEventOperation(db, previewId, false, []);
    throw error;
  }
}
