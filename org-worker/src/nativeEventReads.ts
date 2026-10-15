import { EventIntegrationError } from './eventPlatforms';

type NativeEventRow = Record<string, unknown> & { id: string; slug: string; host_org_id: string; ingest_key: string };
function array(value: unknown) {
  try { const parsed = JSON.parse(String(value || '[]')); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function normalize(row: NativeEventRow) {
  return {
    ...row, systemOfRecord: 'orgportal', id: row.id, name: row.title,
    startAt: row.starts_at, endAt: row.ends_at, descriptionMarkdown: row.description,
    sourceUrl: row.source_url, links: array(row.event_links_json), tags: array(row.tags),
    updateTool: 'preview_org_event_changes',
    // Preserve the stable ingest key and current fields when preparing a native update.
    nativeEvent: { ingestKey: row.ingest_key, slug: row.slug, title: row.title,
      description: row.description, startsAt: row.starts_at, endsAt: row.ends_at,
      location: row.location, sourceUrl: row.source_url, imageUrl: row.image_url,
      links: array(row.event_links_json).map(item => ({ id: item.id, url: item.url, label: item.label, title: item.title,
        description: item.description ?? null, imageUrl: item.image_url ?? null })), tags: array(row.tags), city: row.city },
  };
}
export async function listNativeEvents(db: D1Database, organizationId: string, cursor?: string) {
  let after = '';
  if (cursor) {
    try {
      if (!cursor.startsWith('native:')) throw new Error();
      const decoded = JSON.parse(decodeURIComponent(cursor.slice(7)));
      if (decoded.organizationId !== organizationId || typeof decoded.id !== 'string' || !decoded.id || decoded.id.length > 200) throw new Error();
      after = decoded.id;
    } catch { throw new EventIntegrationError(400, 'Invalid native event cursor'); }
  }
  const rows = (await db.prepare('SELECT * FROM events WHERE host_org_id = ? AND id > ? ORDER BY id LIMIT 51')
    .bind(organizationId, after).all<NativeEventRow>()).results || [];
  const page = rows.slice(0, 50);
  return { systemOfRecord: 'orgportal', events: page.map(normalize),
    nextCursor: rows.length > 50 ? `native:${encodeURIComponent(JSON.stringify({ organizationId, id: page[49].id }))}` : undefined,
    updateTool: 'preview_org_event_changes' };
}
export async function getNativeEvent(db: D1Database, organizationId: string, eventId: string) {
  const row = await db.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first<NativeEventRow>();
  if (!row) return null;
  if (row.host_org_id !== organizationId) throw new EventIntegrationError(403, 'Event is not hosted by this organization');
  return normalize(row);
}
