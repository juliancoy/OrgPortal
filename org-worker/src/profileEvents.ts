export async function profileEvents<T>(db: D1Database, userId: string, registered: boolean, upcomingOnly: boolean, limit: number) {
  const rows = await db.prepare(
    `SELECT e.*, o.name AS organization_name, o.slug AS organization_slug, o.image_url AS organization_image_url
     FROM events e
     LEFT JOIN organizations o ON o.id = e.host_org_id
     WHERE ${registered ? 'EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.user_id = ?)' : 'e.host_user_id = ?'}
       AND (? = 0 OR COALESCE(e.ends_at,e.starts_at,e.event_date) IS NULL OR julianday(COALESCE(e.ends_at,e.starts_at,e.event_date)) >= julianday('now'))
     ORDER BY COALESCE(e.starts_at,e.event_date,e.created_at) ASC
     LIMIT ?`,
  ).bind(userId, upcomingOnly ? 1 : 0, limit).all<T>();
  return rows.results || [];
}
