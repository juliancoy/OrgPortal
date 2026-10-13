export type PosterGalleryImage = {
  id: string; label: string; alt: string; source: string; url: string; image_key?: string;
};
type GalleryRecord = { id: string; slug: string; name?: string; title?: string; image_url?: string | null; social_image_url?: string | null; media_json?: string | null };

// Only saved public HTTPS URLs are eligible. Never accept an image URL from the
// poster request, forward credentials, or follow image-server redirects.
export function publicPosterImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.+$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
      || !host.includes('.') || /[:\[\]]/.test(host) || /^[\d.]+$/.test(host)
      || /(?:^|\.)(?:localhost|local|internal|home|lan|invalid)$/.test(host)) return;
    return url.href;
  } catch { return; }
}

export async function posterGallery(db: D1Database, event: GalleryRecord & { host_org_id?: string | null }): Promise<PosterGalleryImage[]> {
  const organizations = await db.prepare(`SELECT o.id, o.slug, o.name, o.image_url, o.media_json FROM organizations o
    WHERE o.id = ? OR EXISTS (SELECT 1 FROM event_organizations eo WHERE eo.event_id = ? AND eo.organization_id = o.id)
    ORDER BY o.name, o.id`).bind(event.host_org_id || '', event.id).all<GalleryRecord>();
  const related = await db.prepare(`WITH attached AS (
      SELECT o.id FROM organizations o WHERE o.id = ? OR EXISTS (
        SELECT 1 FROM event_organizations eo WHERE eo.event_id = ? AND eo.organization_id = o.id))
    SELECT e.id, e.slug, e.title, e.image_url, e.social_image_url, e.media_json FROM events e
    WHERE e.id != ? AND (e.host_org_id IN (SELECT id FROM attached) OR EXISTS (
      SELECT 1 FROM event_organizations eo WHERE eo.event_id = e.id AND eo.organization_id IN (SELECT id FROM attached)))
    ORDER BY COALESCE(e.starts_at, e.created_at) DESC, e.id`).bind(event.host_org_id || '', event.id, event.id).all<GalleryRecord>();
  const images: PosterGalleryImage[] = [];
  const seen = new Set<string>();
  function add(row: GalleryRecord, type: 'event' | 'organization', current = false) {
    const source = current ? 'This event' : `${type === 'organization' ? 'Organization' : 'Event'}: ${row.name || row.title || row.slug}`;
    const root = `/api/network/${type === 'event' ? 'events' : 'orgs'}/public/${encodeURIComponent(row.slug)}`;
    let media: unknown = [];
    try { media = JSON.parse(row.media_json || '[]'); } catch { /* Old malformed galleries are empty. */ }
    function append(id: string, label: string, alt: string, remote: unknown, key?: unknown) {
      const image_key = typeof key === 'string' && key.startsWith(`${type}-media/${row.id}/`) ? key : undefined;
      const url = image_key ? `${root}/media/${encodeURIComponent(id)}` : publicPosterImageUrl(remote);
      if (!url || seen.has(image_key || url)) return;
      seen.add(image_key || url);
      images.push({ id: `${type}:${row.id}:${id}`, label, alt, source, url, ...(image_key ? { image_key } : {}) });
    }
    if (Array.isArray(media)) for (const item of media) {
      if (!item || typeof item.id !== 'string' || (item.kind && item.kind !== 'image')) continue;
      append(item.id, String(item.label || 'Gallery image'), String(item.alt || item.label || ''), item.url, item.image_key);
    }
    append('$cover', type === 'organization' ? 'Organization profile image' : 'Event cover image', '', row.image_url);
    append('$social', 'Event social image', '', row.social_image_url);
  }
  add(event, 'event', true);
  for (const row of organizations.results || []) add(row, 'organization');
  for (const row of related.results || []) add(row, 'event');
  return images;
}
