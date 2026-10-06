import { z } from 'zod';
import { authorizeOrganization, type OrganizationActor } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { prepareEventOperation, claimEventOperation, finishEventOperation, previewFingerprint } from './eventOperationStore';

const slugSchema = z.string().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const eventSlugSchema = z.object({ eventId: z.string().min(1), organizationId: z.string().min(1).optional(), slug: slugSchema, previewId: z.string().uuid().optional(), confirm: z.boolean().optional() }).strict();
export async function nextEventSlug(db: D1Database, series: string) {
  const prefix = slugSchema.parse(series);
  const rows = await db.prepare('SELECT slug FROM events WHERE slug GLOB ?').bind(`${prefix}-*`).all<{ slug: string }>();
  let highest = 0;
  for (const { slug } of rows.results || []) {
    const suffix = slug.slice(prefix.length + 1);
    if (/^[1-9]\d*$/.test(suffix)) {
      const number = Number(suffix);
      if (Number.isSafeInteger(number)) highest = Math.max(highest, number);
    }
  }
  if (!Number.isSafeInteger(highest + 1)) throw new EventIntegrationError(400, 'Event series number is too large');
  return { series: prefix, number: highest + 1, slug: `${prefix}-${highest + 1}` };
}
export async function runEventSlugOperation(db: D1Database, actor: OrganizationActor, input: unknown, organizationId?: string) {
  const args = eventSlugSchema.parse(input);
  const event = await db.prepare('SELECT id, slug, host_org_id, host_user_id, updated_at FROM events WHERE id = ?').bind(args.eventId).first<{ id: string; slug: string; host_org_id: string | null; host_user_id: string | null; updated_at: string }>();
  if (!event) throw new EventIntegrationError(404, 'Event not found');
  if (organizationId && event.host_org_id !== organizationId) throw new EventIntegrationError(403, 'This MCP connection is limited to its own organization');
  if (event.host_org_id) await authorizeOrganization(db, actor, 'manage', event.host_org_id);
  else if (event.host_user_id !== actor.id && !actor.isOperator) throw new EventIntegrationError(403, 'Event management access required');
  const conflict = await db.prepare('SELECT id FROM events WHERE slug = ? AND id != ?').bind(args.slug, event.id).first();
  if (conflict) throw new EventIntegrationError(409, 'Event slug is already used');
  const preview = { eventId: event.id, before: event.slug, slug: args.slug, updatedAt: event.updated_at, publicUrl: `/events/${args.slug}` };
  const fingerprint = await previewFingerprint(preview);
  const owner = { userId: actor.id, organizationId: event.host_org_id || `user:${actor.id}`, eventId: `slug:${event.id}` };
  if (!args.confirm) return { ...preview, ...await prepareEventOperation(db, owner, fingerprint) };
  if (!args.previewId) throw new EventIntegrationError(409, 'Preview the new event link first');
  await claimEventOperation(db, owner, args.previewId, fingerprint);
  try {
    const changed = await db.prepare('UPDATE events SET slug = ?, updated_at = ? WHERE id = ? AND slug = ? AND updated_at = ? RETURNING id').bind(args.slug, new Date().toISOString(), event.id, event.slug, event.updated_at).first();
    if (!changed) throw new EventIntegrationError(409, 'Event changed; request a new preview');
    await finishEventOperation(db, args.previewId, true, ['rename_event_slug']);
    return { ...preview, success: true };
  } catch (error) { await finishEventOperation(db, args.previewId, false, []); throw error; }
}
