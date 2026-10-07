export async function profileAvailability(db: D1Database, userId: string, profilePublic: boolean, owner = false, now = new Date()) {
  const setting = await db.prepare('SELECT public FROM profile_availability_settings WHERE user_id = ?').bind(userId).first<{ public: number }>();
  const visible = profilePublic && setting?.public === 1;
  if (!owner && !visible) return { public: false, slots: [] as string[] };
  const end = new Date(now.getTime() + 30 * 86400000);
  const rows = await db.prepare(`SELECT slot FROM account_availability
    WHERE user_id = ? AND available = 1 AND julianday(slot) >= julianday(?) AND julianday(slot) < julianday(?)
    ORDER BY julianday(slot) LIMIT 1440`).bind(userId, now.toISOString(), end.toISOString()).all<{ slot: string }>();
  return { public: setting?.public === 1, slots: rows.results.map(row => row.slot) };
}
