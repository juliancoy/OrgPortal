/** Signed-in account discovery for membership assignment, independent of public profiles. */
export async function lookupPortalPeople(db: D1Database, query: string, limit = 40, offset = 0) {
 const q = query.trim().toLowerCase();
 if (q.length < 2 || q.length > 254) return { people: [], nextOffset: null };
 const size = Math.max(1, Math.min(100, Math.floor(limit) || 40));
 const start = Math.max(0, Math.floor(offset) || 0);
 const terms = q.includes('@') ? [q] : q.split(/\s+/).filter(Boolean);
 const predicate = q.includes('@') ? 'lower(email) = ?' : terms.map(() => 'instr(lower(user_name), ?) > 0').join(' AND ');
 const rows = await db.prepare(`WITH known AS (
  SELECT user_id, user_name AS name, user_email AS email, photo_url, 1 AS priority FROM user_contact_pages
  UNION ALL SELECT user_id, user_name, user_email, NULL, 2 FROM organization_memberships
  UNION ALL SELECT user_id, name, email, NULL, 3 FROM ledger_accounts WHERE entity_type = 'individual'
 ), people AS (
  SELECT user_id,
   COALESCE(MAX(CASE WHEN priority=1 THEN NULLIF(name,'') END), MAX(CASE WHEN priority=2 THEN NULLIF(name,'') END), MAX(NULLIF(name,'')), 'Portal member') AS user_name,
   COALESCE(MAX(CASE WHEN priority=1 THEN NULLIF(email,'') END), MAX(CASE WHEN priority=2 THEN NULLIF(email,'') END), MAX(NULLIF(email,''))) AS email,
   MAX(photo_url) AS photo_url
  FROM known WHERE user_id IS NOT NULL AND trim(user_id) <> '' GROUP BY user_id
 ) SELECT user_id, user_name, email, photo_url FROM people WHERE ${predicate}
 ORDER BY lower(user_name), user_id LIMIT ? OFFSET ?`).bind(...terms, size + 1, start).all<{user_id:string;user_name:string;email:string|null;photo_url:string|null}>();
 const people = rows.results || [];
 return { people: people.slice(0, size), nextOffset: people.length > size ? start + size : null };
}
