import { z } from 'zod';
import { EventIntegrationError } from './eventPlatforms';

// Called only inside the existing ingest-token-authorized calendar route.
const optionsSchema = z.object({
  organization_slugs: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  preserve_existing: z.boolean().default(false),
});

export async function calendarCollectionOptions(db: D1Database, payload: unknown) {
  const parsed = optionsSchema.safeParse(payload);
  if (!parsed.success) throw new EventIntegrationError(400, 'Invalid calendar collection options');
  const organizationIds: string[] = [];
  for (const slug of new Set(parsed.data.organization_slugs)) {
    const org = await db.prepare('SELECT id FROM organizations WHERE slug = ?').bind(slug).first<{ id: string }>();
    if (!org) throw new EventIntegrationError(404, `Calendar collection organization not found: ${slug}`);
    organizationIds.push(org.id);
  }
  return { organizationIds, preserveExisting: parsed.data.preserve_existing };
}

export async function addCalendarCollections(db: D1Database, eventId: string, organizationIds: string[], tags?: unknown) {
  const statements: D1PreparedStatement[] = [];
  // Merge in SQL so concurrent additions cannot erase existing classifications.
  if (Array.isArray(tags)) {
    const added = tags.filter((tag): tag is string => typeof tag === 'string' && !!tag.trim())
      .map(tag => tag.trim()).slice(0, 40);
    statements.push(db.prepare(`UPDATE events SET tags = (
      SELECT json_group_array(value) FROM (
        SELECT value FROM json_each(events.tags) UNION SELECT value FROM json_each(?)
      )) WHERE id = ?`).bind(JSON.stringify(added), eventId));
  }
  for (const organizationId of organizationIds) {
    statements.push(db.prepare('INSERT OR IGNORE INTO event_organizations(event_id, organization_id) VALUES (?, ?)')
      .bind(eventId, organizationId));
  }
  if (statements.length) await db.batch(statements);
}
