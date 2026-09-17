import { authenticateMcp, eventErrorResponse, mcpConfiguration } from './eventMcp';
import { EventIntegrationError } from './eventPlatforms';
import { authorizeOrganization } from './organizationIam';
import { claimEventOperation, enforceEventRateLimit, finishEventOperation, prepareEventOperation, previewFingerprint } from './eventOperationStore';

const maxImageBytes = 8 * 1024 * 1024;
const types: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
type Identity = { userId: string; scopes: string[] };

export async function uploadEventMedia(request: Request, env: Env, identity: Identity) {
  if (!identity.scopes.includes('org:events.read') || !identity.scopes.includes('org:events.write')) {
    throw new EventIntegrationError(403, 'Missing event scope');
  }
  await enforceEventRateLimit(env.DB, identity.userId);
  if (!env.SCAN_IMAGES) throw new EventIntegrationError(503, 'Event media storage is not configured');
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new EventIntegrationError(415, 'Multipart form data required');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxImageBytes + 65536) { await reader.cancel(); throw new EventIntegrationError(413, 'Upload exceeds 8 MB'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let form: FormData;
  try { form = await new Response(bytes, { headers: { 'content-type': request.headers.get('content-type')! } }).formData(); }
  catch { throw new EventIntegrationError(400, 'Invalid multipart body'); }
  const fields = new Set(['eventId', 'organizationId', 'image', 'label', 'alt', 'confirm', 'previewId']);
  form.forEach((_value, key) => { if (!fields.has(key) || form.getAll(key).length !== 1) throw new EventIntegrationError(400, 'Invalid upload fields'); });
  const field = (key: string, max: number) => {
    const value = form.get(key);
    if (value !== null && typeof value !== 'string') throw new EventIntegrationError(400, `Invalid ${key}`);
    if ((value?.length || 0) > max) throw new EventIntegrationError(400, `${key} is too long`);
    return value?.trim() || '';
  };
  const eventId = field('eventId', 255), organizationId = field('organizationId', 200);
  const confirm = field('confirm', 5);
  if (confirm && confirm !== 'true' && confirm !== 'false') throw new EventIntegrationError(400, 'Invalid confirmation');
  const image = form.get('image');
  if (!(image instanceof File) || !Object.hasOwn(types, image.type) || !image.size || image.size > maxImageBytes) throw new EventIntegrationError(400, 'A JPEG, PNG, WebP or GIF image up to 8 MB is required');
  const imageBytes = await image.arrayBuffer();
  const signature = new Uint8Array(imageBytes);
  const ascii = (start: number, end: number) => String.fromCharCode(...signature.slice(start, end));
  const valid = image.type === 'image/jpeg' ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255
    : image.type === 'image/png' ? [137,80,78,71,13,10,26,10].every((v, i) => signature[i] === v)
    : image.type === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(ascii(0, 6))
    : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  if (!valid) throw new EventIntegrationError(415, 'Image content does not match its type');
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
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', imageBytes)), b => b.toString(16).padStart(2, '0')).join('');
  const preview = { eventId: row.id, eventSlug: row.slug, eventTitle: row.title, organizationId, before,
    image: { label, alt, contentType: image.type, size: image.size, sha256: hash } };
  const fingerprint = await previewFingerprint({ operation: 'event-media-upload', preview });
  const owner = { userId: identity.userId, organizationId, eventId: row.id };
  if (confirm !== 'true') return { dryRun: true, ...preview, ...await prepareEventOperation(env.DB, owner, fingerprint) };
  const previewId = field('previewId', 36);
  if (!previewId) throw new EventIntegrationError(409, 'Preview required');
  await claimEventOperation(env.DB, owner, previewId, fingerprint);
  const id = crypto.randomUUID();
  const imageKey = `event-media/${row.id}/${id}.${types[image.type]}`;
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
  try {
    const config = mcpConfiguration(env);
    if (!config.introspection) throw new EventIntegrationError(503, 'Uploads require account revocation checks');
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(config.resource).origin) throw new EventIntegrationError(403, 'Origin denied');
    const result = await uploadEventMedia(request, env, await authenticateMcp(request, env));
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) { return eventErrorResponse(error, env); }
}
