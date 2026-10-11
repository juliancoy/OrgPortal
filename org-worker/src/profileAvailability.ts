export async function profileAvailability(db: D1Database, userId: string, profilePublic: boolean, owner = false, now = new Date(), viewerId?: string) {
  const setting = await db.prepare('SELECT public FROM profile_availability_settings WHERE user_id = ?').bind(userId).first<{ public: number }>();
  const visible = profilePublic && setting?.public === 1;
  if (!owner && !visible) return { public: false, slots: [] as string[] };
  const end = new Date(now.getTime() + 30 * 86400000);
  if (!owner && viewerId !== userId) {
    const shared = viewerId ? await db.prepare(`SELECT s.user_id FROM profile_availability_settings s
      JOIN user_contact_pages p ON p.user_id = s.user_id
      WHERE s.user_id = ? AND s.public = 1 AND p.enabled = 1
        AND EXISTS (SELECT 1 FROM account_availability a WHERE a.user_id = s.user_id
          AND julianday(a.slot) >= julianday(?) AND julianday(a.slot) < julianday(?))
      LIMIT 1`).bind(viewerId, now.toISOString(), end.toISOString()).first() : null;
    if (!shared) return { public: true, sharing_required: true, slots: [] as string[] };
  }
  const rows = await db.prepare(`SELECT slot FROM account_availability
    WHERE user_id = ? AND available = 1 AND julianday(slot) >= julianday(?) AND julianday(slot) < julianday(?)
    ORDER BY julianday(slot) LIMIT 1440`).bind(userId, now.toISOString(), end.toISOString()).all<{ slot: string }>();
  return { public: setting?.public === 1, slots: rows.results.map(row => row.slot) };
}
