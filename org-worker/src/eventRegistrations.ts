/** Public previews only include profiles their owners have made public. */
export async function eventAttendance(db: D1Database, eventId: string, userId?: string) {
  const attendees = await db.prepare(`
    SELECT p.slug, p.user_name AS name, p.photo_url
    FROM event_registrations r
    JOIN user_contact_pages p ON p.user_id = r.user_id AND p.enabled = 1
    WHERE r.event_id = ?
    ORDER BY r.registered_at, r.user_id
  `).bind(eventId).all<{ slug: string; name: string | null; photo_url: string | null }>();
  const registration = userId
    ? await db.prepare('SELECT registered_at FROM event_registrations WHERE event_id = ? AND user_id = ?')
      .bind(eventId, userId).first<{ registered_at: string }>()
    : null;
  return {
    event_id: eventId,
    count: (attendees.results || []).length,
    attendees: (attendees.results || []).map((person) => ({
      slug: person.slug,
      // Older contact profiles may use an email address as their display name.
      name: person.name?.trim() && !person.name.includes('@') ? person.name.trim() : 'Registrant',
      photo_url: person.photo_url && /^https?:\/\//i.test(person.photo_url) ? person.photo_url : null,
    })),
    registered: Boolean(registration),
  };
}
