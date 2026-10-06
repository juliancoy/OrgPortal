import { z } from 'zod';
import { authorizeOrganization, type OrganizationActor } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, claimEventOperation, finishEventOperation, previewFingerprint } from './eventOperationStore';

export const eventHostSchema = z.object({
  eventId: z.string().min(1).max(200),
  organizationId: z.string().min(1).max(200),
  tags: z.array(z.string().trim().min(1).max(100)).max(32).optional(),
  confirm: z.boolean().optional(), previewId: z.string().uuid().optional(),
}).strict();

export async function runEventHostOperation(db: D1Database, actor: OrganizationActor, input: unknown) {
  const args = eventHostSchema.parse(input);
  const event = await db.prepare('SELECT id, title, slug, host_org_id, host_user_id, tags, updated_at FROM events WHERE id = ?')
    .bind(args.eventId).first<{ id: string; title: string; slug: string; host_org_id: string | null;
      host_user_id: string | null; tags: string; updated_at: string }>();
  if (!event) throw new EventIntegrationError(404, 'Event not found');
  // Moving an event requires management permission at both ends.
  if (event.host_org_id) await authorizeOrganization(db, actor, 'manage', event.host_org_id);
  else if (event.host_user_id !== actor.id && !actor.isOperator) throw new EventIntegrationError(403, 'Event management access required');
  await authorizeOrganization(db, actor, 'manage', args.organizationId);
  const destination = await db.prepare('SELECT id, name, source_url FROM organizations WHERE id = ?')
    .bind(args.organizationId).first<{ id: string; name: string; source_url: string | null }>();
  if (!destination) throw new EventIntegrationError(404, 'Organization not found');
  await enforceEventRateLimit(db, actor.id);
  const preview = { eventId: event.id, title: event.title, slug: event.slug, before: event.host_org_id,
    destination, tags: args.tags ? JSON.stringify(args.tags) : event.tags, updatedAt: event.updated_at };
  const owner = { userId: actor.id, organizationId: destination.id, eventId: `host:${event.id}` };
  const fingerprint = await previewFingerprint(preview);
  if (!args.confirm) return { ...preview, ...await prepareEventOperation(db, owner, fingerprint) };
  if (!args.previewId) throw new EventIntegrationError(409, 'Preview the event host first');
  await claimEventOperation(db, owner, args.previewId, fingerprint);
  try {
    const changed = await db.prepare(`UPDATE events SET host_org_id = ?, host_org_name = ?, host_org_source_url = ?,
      host_user_id = NULL, host_user_name = NULL, tags = ?, updated_at = ?
      WHERE id = ? AND updated_at = ? RETURNING id`)
      .bind(destination.id, destination.name, destination.source_url, preview.tags, new Date().toISOString(), event.id, event.updated_at).first();
    if (!changed) throw new EventIntegrationError(409, 'Event changed; request a new preview');
    await finishEventOperation(db, args.previewId, true, ['change_event_host']);
    return { ...preview, success: true };
  } catch (error) { await finishEventOperation(db, args.previewId, false, []); throw error; }
}
