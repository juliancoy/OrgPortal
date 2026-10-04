import { Hono } from 'hono';

type NametagRow = { id: string; user_id: string; user_name: string | null; slug: string; photo_url: string | null; enabled: number };

export function nametagRoutes(requireAdmin: (env: Env, request: Request) => Promise<void>) {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/', async c => {
    await requireAdmin(c.env, c.req.raw);
    c.header('Cache-Control', 'no-store');
    const limit = Math.max(1, Math.min(Number.parseInt(c.req.query('limit') || '500', 10) || 500, 500));
    const cursor = c.req.query('cursor') || '';
    const rows = await c.env.DB.prepare(
      'SELECT id, user_id, user_name, slug, photo_url, enabled FROM user_contact_pages WHERE id > ? ORDER BY id LIMIT ?',
    ).bind(cursor, limit).all<NametagRow>();
    const people = rows.results || [];
    return c.json({
      people: people.map(row => ({ user_id: row.user_id, name: row.user_name || 'User', slug: row.slug, avatar_url: row.photo_url || '', public: Boolean(row.enabled) })),
      next_cursor: people.length === limit ? people[people.length - 1].id : null,
    });
  });
  return app;
}
