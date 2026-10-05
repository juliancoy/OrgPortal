import { z } from 'zod';
import { type OrganizationActor } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, previewFingerprint, claimEventOperation, finishEventOperation } from './eventOperationStore';

const publicUrl = z.string().url().max(2000).refine(value => {
  const url = new URL(value);
  return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
});
export const registrySchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(5000),
  sourceUrl: publicUrl,
  website: publicUrl.optional(),
  city: z.string().trim().min(1).max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  confirm: z.boolean().optional(), previewId: z.string().uuid().optional(),
}).strict();

// Register public evidence in the existing directory without inventing ownership.
export async function runOrganizationRegistryOperation(db: D1Database, actor: OrganizationActor, input: unknown) {
  if (!actor.isOperator) throw new EventIntegrationError(403, 'Operator access required');
  const parsed = registrySchema.safeParse(input);
  if (!parsed.success) throw new EventIntegrationError(400, 'Invalid organization registry request');
  const { confirm, previewId, ...changes } = parsed.data;
  await enforceEventRateLimit(db, actor.id);
  const existing = await db.prepare('SELECT id FROM organizations WHERE lower(name) = lower(?) OR (? IS NOT NULL AND source_url = ?) LIMIT 1')
    .bind(changes.name, changes.website || null, changes.website || null).first();
  if (existing) throw new EventIntegrationError(409, 'Organization already exists; review its existing identity');
  const preview = { operation: 'register', changes, effect: 'Creates an unclaimed public directory organization. No ownership, memberships or account permissions are created.' };
  const fingerprint = await previewFingerprint(preview);
  const owner = { userId: actor.id, organizationId: 'organization:registry', eventId: `organization:registry:${fingerprint}` };
  if (!confirm) return { ...preview, ...await prepareEventOperation(db, owner, fingerprint) };
  if (!previewId) throw new EventIntegrationError(409, 'Request a preview first and supply its previewId');
  await claimEventOperation(db, owner, previewId, fingerprint);
  const id = `registry-${previewId}`;
  const slug = changes.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 150) || 'organization';
  const identityHash = await previewFingerprint({ name: changes.name.toLowerCase() });
  const now = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(`INSERT INTO organizations (id,name,slug,description,source_url,tags,city,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).bind(id, changes.name, `${slug}-${identityHash.slice(0,12)}`, changes.description,
          changes.website || null, JSON.stringify(changes.tags), changes.city || null, now, now),
      db.prepare(`INSERT INTO audit_events (id,actor_user_id,action,resource_type,resource_id,metadata_json,created_at)
        VALUES (?,?,'organization.register','organization',?,?,?)`).bind(crypto.randomUUID(), actor.id, id, JSON.stringify(preview), now),
    ]);
    await finishEventOperation(db, previewId, true, ['register']);
    return { organizationId: id, previewId, organization: await db.prepare('SELECT id,name,slug,source_url FROM organizations WHERE id=?').bind(id).first() };
  } catch (error) {
    await finishEventOperation(db, previewId, false, []);
    throw error;
  }
}
