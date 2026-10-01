import { EventIntegrationError } from './eventPlatforms';
import { authorizeOrganization } from './organizationIam';
import { claimEventOperation, enforceEventRateLimit, finishEventOperation, prepareEventOperation, previewFingerprint } from './eventOperationStore';
import { handleMcpMediaUpload, parseImageUploadRequest, type McpIdentity } from './mediaUpload';

export async function uploadEventMedia(request: Request, env: Env, identity: McpIdentity) {
  if (!identity.scopes.includes('org:events.read') || !identity.scopes.includes('org:events.write')) {
    throw new EventIntegrationError(403, 'Missing event scope');
  }
  await enforceEventRateLimit(env.DB, identity.userId);
  if (!env.SCAN_IMAGES) throw new EventIntegrationError(503, 'Event media storage is not configured');
  const { field, image, imageBytes, extension, confirm, sha256 } = await parseImageUploadRequest(request, ['eventId', 'organizationId', 'image', 'label', 'alt', 'confirm', 'previewId']);
  const eventId = field('eventId', 255), organizationId = field('organizationId', 200);
  const row = await env.DB.prepare('SELECT id, slug, title, host_org_id, media_json FROM events WHERE id = ? OR slug = ?')
    .bind(eventId, eventId).first<{ id: string; slug: string; title: string; host_org_id: string; media_json: string }>();
  if (!row) throw new EventIntegrationError(404, 'Event not found');
  if (row.host_org_id !== organizationId) throw new EventIntegrationError(403, 'Event does not belong to this organization');
  await authorizeOrganization(env.DB, { id: identity.userId, name: identity.userId, email: null, isOperator: false }, 'manage', organizationId);
  const before = JSON.parse(row.media_json || '[]');
  if (!Array.isArray(before)) throw new EventIntegrationError(500, 'Invalid gallery');
  if (before.length >= 12) throw new EventIntegrationError(409, 'Gallery already has 12 items');
  const label = field('label', 160) || image.name.slice(0, 160) || 'Event image';
  const alt = field('alt', 500) || label;
  const preview = { eventId: row.id, eventSlug: row.slug, eventTitle: row.title, organizationId, before,
    image: { label, alt, contentType: image.type, size: image.size, sha256 } };
  const fingerprint = await previewFingerprint({ operation: 'event-media-upload', preview });
  const owner = { userId: identity.userId, organizationId, eventId: row.id };
  if (confirm !== 'true') return { dryRun: true, ...preview, ...await prepareEventOperation(env.DB, owner, fingerprint) };
  const previewId = field('previewId', 36);
  if (!previewId) throw new EventIntegrationError(409, 'Preview required');
  await claimEventOperation(env.DB, owner, previewId, fingerprint);
  const id = crypto.randomUUID();
  const imageKey = `event-media/${row.id}/${id}.${extension}`;
  const item = { id, url: `/api/network/events/public/${encodeURIComponent(row.slug)}/media/${id}`,
    label, alt, kind: 'image', content_type: image.type, image_key: imageKey };
  const media = [...before, item];
  try {
    await env.SCAN_IMAGES.put(imageKey, imageBytes, { httpMetadata: { contentType: image.type }, customMetadata: { event_id: row.id, submitted_by_user_id: identity.userId } });
    // Compare-and-swap prevents another gallery edit being overwritten after preview.
    const updated = await env.DB.prepare('UPDATE events SET media_json = ?, updated_at = ? WHERE id = ? AND media_json = ? AND host_org_id = ? RETURNING id')
      .bind(JSON.stringify(media), new Date().toISOString(), row.id, row.media_json, organizationId).first();
    if (!updated) {
      await env.SCAN_IMAGES.delete(imageKey);
      throw new EventIntegrationError(409, 'Gallery changed; request a new preview');
    }
    await finishEventOperation(env.DB, previewId, true, ['uploaded', 'attached']);
    return { success: true, eventId: row.id, previewId, media };
  } catch {
    try { await finishEventOperation(env.DB, previewId, false, []); } catch { /* Retain executing receipt for inspection. */ }
    return { success: false, outcomeUncertain: true, previewId, message: 'Inspect the operation and gallery before retrying; the upload may have completed.' };
  }
}

export async function handleEventMediaUpload(request: Request, env: Env) {
  return handleMcpMediaUpload(request, env, (identity) => uploadEventMedia(request, env, identity));
}
