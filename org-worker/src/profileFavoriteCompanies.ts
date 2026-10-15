import { HTTPException } from 'hono/http-exception';

export async function profileFavoriteCompanies(db: D1Database, userId: string, profilePublic: boolean, owner: boolean) {
  const preference = await db.prepare('SELECT public FROM profile_favorite_company_settings WHERE user_id = ?')
    .bind(userId).first<{ public: number }>();
  const shared = Boolean(preference?.public);
  if (!owner && (!profilePublic || !shared)) return { public: shared, companies: [] };
  // Derive the list from the original expiring favorites. No copied voting history.
  const rows = await db.prepare(`SELECT DISTINCT o.id, o.name, o.slug, o.image_url, o.description
    FROM event_company_favorites f JOIN organizations o ON o.id = f.organization_id
    WHERE f.user_id = ? AND julianday(f.expires_at) > julianday('now')
    ORDER BY lower(o.name), o.id`).bind(userId).all();
  return { public: shared, companies: rows.results };
}

export async function setFavoriteCompaniesSharing(db: D1Database, userId: string, payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || Object.keys(payload).length !== 1 || typeof (payload as { public?: unknown }).public !== 'boolean') {
    throw new HTTPException(400, { message: 'Provide only a boolean public setting.' });
  }
  await db.prepare(`INSERT INTO profile_favorite_company_settings (user_id, public, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(user_id) DO UPDATE SET public = excluded.public, updated_at = excluded.updated_at`)
    .bind(userId, (payload as { public: boolean }).public ? 1 : 0).run();
}
