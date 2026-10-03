import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { resolvePortalTenant } from './timebank';

export const MEDTECH_CAROUSEL = { id: 'medtech-photos', tenantHostnames: ['medtech.social', 'lifetech.fyi'], folderId: '1PoJ9KQvInRhJeoY91ODJ-915_eGuPAmb', title: 'Community photos' };
export type CarouselImage = { id: string; name: string; imageUrl: string; driveUrl: string };
export type CarouselFolder = { title: string; folderUrl: string; images: CarouselImage[] };
const decode = (value: string) => value.replace(/&(?:amp|quot|apos|lt|gt|#39|#(\d+)|#x([a-f0-9]+));/gi, (match, decimal, hex) => decimal || hex ? String.fromCodePoint(parseInt(decimal || hex, hex ? 16 : 10)) : ({'&amp;':'&','&quot;':'"','&apos;':"'",'&#39;':"'",'&lt;':'<','&gt;':'>'}[match.toLowerCase()] || match));

// Google's public folder view is the source. No private Drive credentials or arbitrary URLs are accepted.
export function parsePublicDriveFolder(html: string): CarouselFolder {
  if (!html.includes('flip-entry') && !html.includes('flip-entries')) throw new HTTPException(502, { message: 'The photo folder is unavailable. Open it in Google Drive.' });
  const images: CarouselImage[] = [];
  const blocks = html.split(/<div\s+class="flip-entry"\s+id="entry-/).slice(1);
  for (const block of blocks) {
    const id = block.match(/^([A-Za-z0-9_-]{10,100})"/)?.[1];
    const name = block.match(/class="flip-entry-title">([^<]*)<\/div>/)?.[1];
    const thumbnail = block.match(/class="flip-entry-thumb"><img[^>]*src="([^"]+)"/)?.[1];
    if (!id || !name || !thumbnail || !/type\/image\//.test(block)) continue;
    const url = new URL(decode(thumbnail));
    if (url.protocol !== 'https:' || url.hostname !== 'lh3.googleusercontent.com' || !url.pathname.startsWith('/drive-storage/')) continue;
    images.push({ id, name: decode(name), imageUrl: url.href.replace(/=s\d+$/, '=w1600'), driveUrl: `https://drive.google.com/file/d/${id}/view` });
  }
  return { title: MEDTECH_CAROUSEL.title, folderUrl: `https://drive.google.com/drive/folders/${MEDTECH_CAROUSEL.folderId}`, images };
}
let cached: { expires: number; folder: CarouselFolder } | undefined;
export async function publicDriveFolder(): Promise<CarouselFolder> {
  if (cached && cached.expires > Date.now()) return cached.folder;
  let response: Response;
  try {
    response = await fetch(`https://drive.google.com/embeddedfolderview?id=${MEDTECH_CAROUSEL.folderId}`, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
  } catch {
    throw new HTTPException(502, { message: 'The photo folder is unavailable. Please try again.' });
  }
  if (!response.ok) throw new HTTPException(502, { message: 'The photo folder is unavailable. Please try again.' });
  const html = await response.text();
  if (html.length > 2_000_000) throw new HTTPException(502, { message: 'The photo folder is too large to display.' });
  const folder = parsePublicDriveFolder(html);
  cached = { expires: Date.now() + 120_000, folder };
  return folder;
}

export function driveCarouselRoutes(getUser: (env: Env, request: Request) => Promise<{ id: string }>, loadFolder = publicDriveFolder) {
  const app = new Hono<{ Bindings: Env; Variables: { carouselTenant: string } }>();
  app.use('/:carousel/*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    const tenant = await resolvePortalTenant(c.env.DB, c.req.raw);
    if (!MEDTECH_CAROUSEL.tenantHostnames.includes(tenant.hostname) || c.req.param('carousel') !== MEDTECH_CAROUSEL.id) throw new HTTPException(404, { message: 'Photo carousel not found.' });
    c.set('carouselTenant', tenant.id);
    await next();
  });
  app.get('/:carousel', async c => {
    c.header('Cache-Control', 'private, no-store');
    const tenant = await resolvePortalTenant(c.env.DB, c.req.raw);
    if (!MEDTECH_CAROUSEL.tenantHostnames.includes(tenant.hostname) || c.req.param('carousel') !== MEDTECH_CAROUSEL.id) throw new HTTPException(404, { message: 'Photo carousel not found.' });
    return c.json(await loadFolder());
  });
  app.get('/:carousel/me', async c => {
    const user = await getUser(c.env, c.req.raw);
    const rows = await c.env.DB.prepare('SELECT file_id FROM user_hidden_carousel_images WHERE tenant_id = ? AND user_id = ? AND carousel_id = ? ORDER BY hidden_at,file_id').bind(c.get('carouselTenant'), user.id, MEDTECH_CAROUSEL.id).all<{ file_id: string }>();
    return c.json({ hiddenImageIds: (rows.results || []).map(row => row.file_id) });
  });
  app.put('/:carousel/me/hidden/:file', async c => {
    const user = await getUser(c.env, c.req.raw), id = c.req.param('file');
    const folder = await loadFolder();
    if (!folder.images.some(image => image.id === id)) throw new HTTPException(404, { message: 'Image not found in this folder.' });
    await c.env.DB.prepare('INSERT INTO user_hidden_carousel_images (tenant_id,user_id,carousel_id,file_id) VALUES (?,?,?,?) ON CONFLICT DO NOTHING').bind(c.get('carouselTenant'), user.id, MEDTECH_CAROUSEL.id, id).run();
    return c.json({ hidden: true, fileId: id });
  });
  app.delete('/:carousel/me/hidden/:file', async c => {
    const user = await getUser(c.env, c.req.raw), id = c.req.param('file');
    await c.env.DB.prepare('DELETE FROM user_hidden_carousel_images WHERE tenant_id = ? AND user_id = ? AND carousel_id = ? AND file_id = ?').bind(c.get('carouselTenant'), user.id, MEDTECH_CAROUSEL.id, id).run();
    return c.json({ hidden: false, fileId: id });
  });
  return app;
}
