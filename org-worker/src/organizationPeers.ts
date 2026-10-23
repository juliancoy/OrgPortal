import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

export async function listOrganizationPeers(db: D1Database, organizationId: string, query = '', limit = 12) {
  const source = await db.prepare('SELECT tags FROM organizations WHERE id=?').bind(organizationId).first<{ tags: string | null }>();
  if (!source) throw new HTTPException(404, { message: 'Organization not found.' });
  let tags: string[] = [];
  try { tags = JSON.parse(source.tags || '[]'); } catch { /* Untagged organizations have no peers. */ }
  if (!Array.isArray(tags) || !tags.length) return { organizations: [], hasMore: false };
  const size = Math.max(1, Math.min(100, Math.trunc(limit) || 12));
  const result = await db.prepare(`
    SELECT peer.id,peer.name,peer.slug,peer.image_url,peer.tags,
      (SELECT count(DISTINCT lower(trim(p.value))) FROM json_each(CASE WHEN json_valid(peer.tags) THEN peer.tags ELSE '[]' END) p
       JOIN json_each(?) s ON lower(trim(p.value))=lower(trim(s.value))) AS shared_tag_count
    FROM organizations peer
    WHERE peer.id!=? AND instr(lower(peer.name || ' ' || COALESCE(peer.description,'') || ' ' || COALESCE(peer.tags,'')),lower(?))>0
      AND shared_tag_count>0
    ORDER BY shared_tag_count DESC,lower(peer.name),peer.id LIMIT ?
  `).bind(JSON.stringify(tags), organizationId, query.trim(), size + 1).all<{ id: string; name: string; slug: string; image_url: string | null; tags: string; shared_tag_count: number }>();
  const rows = result.results || [];
  return { organizations: rows.slice(0, size).map(row => ({ id: row.id, name: row.name, slug: row.slug, image_url: row.image_url, tags: JSON.parse(row.tags) as string[] })), hasMore: rows.length > size };
}

export function organizationPeersRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/:organizationId/peers', async c => {
    c.header('Cache-Control', 'public, max-age=60');
    return c.json(await listOrganizationPeers(c.env.DB, c.req.param('organizationId'), c.req.query('q'), Number(c.req.query('limit') || 12)));
  });
  return app;
}
