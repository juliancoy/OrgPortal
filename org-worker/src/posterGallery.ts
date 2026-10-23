import { MEDTECH_CAROUSEL, publicDriveFolder } from './driveCarousel';
export type PosterGalleryImage = {
  id: string; label: string; alt: string; source: string; url: string; image_key?: string;
};
type GalleryRecord = { id: string; slug: string; name?: string; title?: string; image_url?: string | null; social_image_url?: string | null; media_json?: string | null; event_links_json?: string | null };

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

export async function posterGallery(db: D1Database, event: GalleryRecord & { host_org_id?: string | null }, organization = false): Promise<PosterGalleryImage[]> {
  // Calendar membership is not hosting: imported partner events must not leak in.
  const organizations = organization ? { results: [event] } : await db.prepare(`SELECT o.id, o.slug, o.name, o.image_url, o.media_json FROM organizations o
    WHERE o.id = ? ORDER BY o.id`).bind(event.host_org_id || '').all<GalleryRecord>();
  const related = organization ? { results: [] } : await db.prepare(`SELECT e.id, e.slug, e.title, e.image_url, e.social_image_url, e.media_json, e.event_links_json FROM events e
    WHERE e.id != ? AND e.host_org_id = ?
      AND julianday(COALESCE(e.ends_at, e.starts_at, e.event_date)) < julianday('now')
    ORDER BY COALESCE(e.starts_at, e.event_date) DESC, e.id`).bind(event.id, event.host_org_id || '').all<GalleryRecord>();
  const images: PosterGalleryImage[] = [];
  const seen = new Set<string>();
  const folders = new Map<string, { row: GalleryRecord; type: 'event' | 'organization'; source: string }>();
  function add(row: GalleryRecord, type: 'event' | 'organization', current = false) {
    const source = current ? 'This event' : `${type === 'organization' ? 'Organization' : 'Event'}: ${row.name || row.title || row.slug}`;
    const root = `/api/network/${type === 'event' ? 'events' : 'orgs'}/public/${encodeURIComponent(row.slug)}`;
    let media: unknown = [];
    try { media = JSON.parse(row.media_json || '[]'); } catch { /* Old malformed galleries are empty. */ }
    function append(id: string, label: string, alt: string, remote: unknown, key?: unknown) {
      const image_key = typeof key === 'string' && key.startsWith(`${type}-media/${row.id}/`) ? key : undefined;
      const drive = driveLink(remote);
      if (drive?.kind === 'folder') { if (!folders.has(drive.id)) folders.set(drive.id, { row, type, source }); return; }
      const url = image_key ? `${root}/media/${encodeURIComponent(id)}` : publicPosterImageUrl(drive?.kind === 'file' ? `https://lh3.googleusercontent.com/d/${drive.id}=w1600` : remote);
      if (!url || seen.has(image_key || url)) return;
      seen.add(image_key || url);
      images.push({ id: `${type}:${row.id}:${id}`, label, alt, source, url, ...(image_key ? { image_key } : {}) });
    }
    if (Array.isArray(media)) for (const item of media) {
      if (!item || typeof item.id !== 'string' || (item.kind && item.kind !== 'image' && !driveLink(item.url))) continue;
      append(item.id, String(item.label || 'Gallery image'), String(item.alt || item.label || ''), item.url, item.image_key);
    }
    let links: unknown = [];
    try { links = JSON.parse(row.event_links_json || '[]'); } catch { /* Ignore malformed legacy links. */ }
    if (Array.isArray(links)) for (const link of links) {
      if (link && typeof link.id === 'string' && driveLink(link.url)) append(`link:${link.id}`, String(link.label || 'Google Drive image'), '', link.url);
    }
    append('$cover', type === 'organization' ? 'Organization profile image' : 'Event cover image', '', row.image_url);
    append('$social', 'Event social image', '', row.social_image_url);
  }
  if (!organization) add(event, 'event', true);
  for (const row of organizations.results || []) add(row, 'organization');
  for (const row of related.results || []) add(row, 'event');
  for (const row of organizations.results || []) if (row.id === MEDTECH_CAROUSEL.organizationId && !folders.has(MEDTECH_CAROUSEL.folderId)) {
    folders.set(MEDTECH_CAROUSEL.folderId, { row, type: 'organization', source: `Organization: ${row.name} — Google Drive` });
  }
  for (const [folderId, { row, type, source }] of folders) {
    const folder = await publicDriveFolder(folderId);
    for (const image of folder.images) {
      if (seen.has(image.imageUrl)) continue;
      seen.add(image.imageUrl);
      images.push({ id: `${type}:${row.id}:drive:${image.id}`, label: image.name, alt: image.name, source, url: image.imageUrl });
    }
  }
  return images;
}

// Resolve only known Drive share URL shapes; folders are expanded through the
// existing public album reader. No Google account credentials are involved.
export function driveLink(value: unknown): { kind: 'file' | 'folder'; id: string } | undefined {
  const safe = publicPosterImageUrl(value);
  if (!safe) return;
  const url = new URL(safe);
  if (url.hostname !== 'drive.google.com') return;
  const folder = url.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,100})(?:\/|$)/)?.[1];
  if (folder) return { kind: 'folder', id: folder };
  const id = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,100})(?:\/|$)/)?.[1]
    || (['/open', '/uc', '/thumbnail'].includes(url.pathname) ? url.searchParams.get('id') : null);
  if (id && /^[A-Za-z0-9_-]{10,100}$/.test(id)) return { kind: 'file', id };
}
