import { EventIntegrationError } from './eventPlatforms';
import { authorizeOrganization } from './organizationIam';
import { claimEventOperation, enforceEventRateLimit, finishEventOperation, prepareEventOperation, previewFingerprint } from './eventOperationStore';
import { authorizeMcpOrganization, handleMcpMediaUpload, parseImageUploadRequest, type McpIdentity } from './mediaUpload';

export async function uploadOrganizationMedia(request: Request, env: Env, identity: McpIdentity) {
  if (!identity.scopes.includes('org:portal.read') || !identity.scopes.includes('org:portal.write')) {
    throw new EventIntegrationError(403, 'Missing portal scope');
  }
  await enforceEventRateLimit(env.DB, identity.userId);
  if (!env.SCAN_IMAGES) throw new EventIntegrationError(503, 'Organization media storage is not configured');
  const { field, image, imageBytes, extension, confirm, sha256 } = await parseImageUploadRequest(request, ['organizationId', 'image', 'label', 'alt', 'confirm', 'previewId']);
  const organizationId = field('organizationId', 200);
  authorizeMcpOrganization(identity, organizationId);
  const row = await env.DB.prepare('SELECT id, slug, name, media_json FROM organizations WHERE id = ? OR slug = ?')
    .bind(organizationId, organizationId).first<{ id: string; slug: string; name: string; media_json: string }>();
  if (!row) throw new EventIntegrationError(404, 'Organization not found');
  await authorizeOrganization(env.DB, { id: identity.userId, name: identity.userId, email: null, isOperator: false }, 'manage', row.id);
  const before = JSON.parse(row.media_json || '[]');
  if (!Array.isArray(before)) throw new EventIntegrationError(500, 'Invalid gallery');
  if (before.length >= 12) throw new EventIntegrationError(409, 'Gallery already has 12 items');
  const label = field('label', 160) || image.name.slice(0, 160) || 'Organization image';
  const alt = field('alt', 500) || label;
  const preview = { organizationId: row.id, organizationSlug: row.slug, organizationName: row.name, before,
    image: { label, alt, contentType: image.type, size: image.size, sha256 } };
  const fingerprint = await previewFingerprint({ operation: 'organization-media-upload', preview });
  const owner = { userId: identity.userId, organizationId: row.id, eventId: `organization-media:${row.id}` };
  if (confirm !== 'true') return { dryRun: true, ...preview, ...await prepareEventOperation(env.DB, owner, fingerprint) };
  const previewId = field('previewId', 36);
  if (!previewId) throw new EventIntegrationError(409, 'Preview required');
  await claimEventOperation(env.DB, owner, previewId, fingerprint);
  const id = crypto.randomUUID();
  const imageKey = `organization-media/${row.id}/${id}.${extension}`;
  const item = { id, url: `/api/network/orgs/public/${encodeURIComponent(row.slug)}/media/${id}`,
    label, alt, kind: 'image', content_type: image.type, image_key: imageKey };
  const media = [...before, item];
  try {
    await env.SCAN_IMAGES.put(imageKey, imageBytes, { httpMetadata: { contentType: image.type }, customMetadata: { organization_id: row.id, submitted_by_user_id: identity.userId } });
    const updated = await env.DB.prepare('UPDATE organizations SET media_json = ?, updated_at = ? WHERE id = ? AND media_json = ? RETURNING id')
      .bind(JSON.stringify(media), new Date().toISOString(), row.id, row.media_json).first();
    if (!updated) {
      await env.SCAN_IMAGES.delete(imageKey);
      throw new EventIntegrationError(409, 'Gallery changed; request a new preview');
    }
    await finishEventOperation(env.DB, previewId, true, ['uploaded', 'attached']);
    return { success: true, organizationId: row.id, previewId, media };
  } catch {
    try { await finishEventOperation(env.DB, previewId, false, []); } catch { /* Retain executing receipt for inspection. */ }
    return { success: false, outcomeUncertain: true, previewId, message: 'Inspect the operation and gallery before retrying; the upload may have completed.' };
  }
}

export async function handleOrganizationMediaUpload(request: Request, env: Env) {
  return handleMcpMediaUpload(request, env, (identity) => uploadOrganizationMedia(request, env, identity));
}
