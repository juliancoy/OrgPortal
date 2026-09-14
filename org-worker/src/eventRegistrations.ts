export async function eventAttendance(db: D1Database, eventId: string, userId?: string) {
  const total = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM event_registrations
    WHERE event_id = ?
  `).bind(eventId).first<{ count: number }>();
  const attendees = await db.prepare(`
    SELECT r.user_id, p.slug, p.user_name AS name, p.photo_url, p.enabled
    FROM event_registrations r
    JOIN user_contact_pages p ON p.user_id = r.user_id
    WHERE r.event_id = ?
      AND p.slug <> ''
      AND p.user_name IS NOT NULL
      AND trim(p.user_name) <> ''
      AND instr(p.user_name, '@') = 0
      AND (p.photo_url IS NULL OR p.photo_url LIKE 'http://%' OR p.photo_url LIKE 'https://%')
    ORDER BY r.registered_at, r.user_id
  `).bind(eventId).all<{ user_id: string; slug: string; name: string; photo_url: string | null; enabled: number }>();
  const registration = userId
    ? await db.prepare('SELECT registered_at FROM event_registrations WHERE event_id = ? AND user_id = ?')
      .bind(eventId, userId).first<{ registered_at: string }>()
    : null;
  return {
    event_id: eventId,
    count: Number(total?.count || 0),
    attendees: (attendees.results || []).map((person) => ({
      user_id: person.user_id,
      slug: person.slug,
      name: person.name.trim(),
      photo_url: person.photo_url,
      profile_public: person.enabled === 1,
    })),
    registered: Boolean(registration),
  };
}
