import { authenticateMcp, eventErrorResponse, mcpConfiguration } from './eventMcp';
import { EventIntegrationError } from './eventPlatforms';

export const maxImageBytes = 8 * 1024 * 1024;
export const imageExtensionsByType: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
export type McpIdentity = { userId: string; scopes: string[]; organizationId?: string; resource?: string };
export function authorizeMcpOrganization(identity: McpIdentity, organizationId: string) {
  if (identity.organizationId && identity.organizationId !== organizationId) throw new EventIntegrationError(403, 'This MCP connection is limited to its own organization');
}

type ParsedUpload = {
  field: (key: string, max: number) => string;
  image: File;
  imageBytes: ArrayBuffer;
  extension: string;
  confirm: string;
  sha256: string;
};

async function boundedMultipartForm(request: Request) {
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
  try { return await new Response(bytes, { headers: { 'content-type': request.headers.get('content-type')! } }).formData(); }
  catch { throw new EventIntegrationError(400, 'Invalid multipart body'); }
}

function validateUploadFields(form: FormData, fields: Set<string>) {
  form.forEach((_value, key) => {
    if (!fields.has(key) || form.getAll(key).length !== 1) throw new EventIntegrationError(400, 'Invalid upload fields');
  });
}

async function verifiedImageBytes(image: File) {
  const imageBytes = await image.arrayBuffer();
  const signature = new Uint8Array(imageBytes);
  const ascii = (start: number, end: number) => String.fromCharCode(...signature.slice(start, end));
  const valid = image.type === 'image/jpeg' ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255
    : image.type === 'image/png' ? [137,80,78,71,13,10,26,10].every((v, i) => signature[i] === v)
    : image.type === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(ascii(0, 6))
    : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  if (!valid) throw new EventIntegrationError(415, 'Image content does not match its type');
  return imageBytes;
}

export async function parseImageUploadRequest(request: Request, allowedFields: string[]): Promise<ParsedUpload> {
  const form = await boundedMultipartForm(request);
  validateUploadFields(form, new Set(allowedFields));
  const field = (key: string, max: number) => {
    const value = form.get(key);
    if (value !== null && typeof value !== 'string') throw new EventIntegrationError(400, `Invalid ${key}`);
    if ((value?.length || 0) > max) throw new EventIntegrationError(400, `${key} is too long`);
    return value?.trim() || '';
  };
  const confirm = field('confirm', 5);
  if (confirm && confirm !== 'true' && confirm !== 'false') throw new EventIntegrationError(400, 'Invalid confirmation');
  const image = form.get('image');
  if (!(image instanceof File) || !Object.hasOwn(imageExtensionsByType, image.type) || !image.size || image.size > maxImageBytes) {
    throw new EventIntegrationError(400, 'A JPEG, PNG, WebP or GIF image up to 8 MB is required');
  }
  const imageBytes = await verifiedImageBytes(image);
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', imageBytes)), b => b.toString(16).padStart(2, '0')).join('');
  return { field, image, imageBytes, extension: imageExtensionsByType[image.type], confirm, sha256 };
}

export async function handleMcpMediaUpload(request: Request, env: Env, upload: (identity: McpIdentity) => Promise<unknown>) {
  try {
    const config = mcpConfiguration(env, request);
    if (!config.introspection) throw new EventIntegrationError(503, 'Uploads require account revocation checks');
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(config.resource).origin) throw new EventIntegrationError(403, 'Origin denied');
    const result = await upload(await authenticateMcp(request, env));
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) { return eventErrorResponse(error, env, request); }
}
