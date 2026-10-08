import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

type Ballot = { closes_at: string; enabled: number };

async function eventBallot(db: D1Database, eventId: string) {
  const event = await db.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first();
  if (!event) throw new HTTPException(404, { message: 'Event not found.' });
  return db.prepare('SELECT closes_at, enabled FROM event_company_ballots WHERE event_id = ?')
    .bind(eventId).first<Ballot>();
}

export async function companyVoteSummary(db: D1Database, eventId: string) {
  const ballot = await eventBallot(db, eventId);
  if (!ballot) return { available: false, closed: true, closes_at: null, companies: [] };
  const rows = await db.prepare(`SELECT o.id, o.name, o.slug, o.image_url,
    COALESCE(SUM(v.value = 1), 0) AS upvotes,
    COALESCE(SUM(v.value = -1), 0) AS downvotes, COALESCE(SUM(v.value), 0) AS score
    FROM event_pitch_companies p JOIN organizations o ON o.id = p.organization_id
    LEFT JOIN event_company_votes v ON v.event_id = p.event_id AND v.organization_id = p.organization_id
      AND julianday(v.expires_at) > julianday('now')
    WHERE p.event_id = ? GROUP BY o.id ORDER BY score DESC, lower(o.name), o.id`)
    .bind(eventId).all();
  return { available: true, closed: !ballot.enabled || Date.parse(ballot.closes_at) <= Date.now(),
    closes_at: ballot.closes_at, companies: rows.results };
}

export function companyVoteRoutes(auth: (env: Env, request: Request) => Promise<{ id: string }>) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
  app.get('/:id/company-votes/public', async c => c.json(await companyVoteSummary(c.env.DB, c.req.param('id'))));
  app.get('/:id/company-votes', async c => {
    const user = await auth(c.env, c.req.raw), eventId = c.req.param('id');
    await eventBallot(c.env.DB, eventId);
    const rows = await c.env.DB.prepare(`SELECT organization_id, value FROM event_company_votes
      WHERE event_id = ? AND user_id = ? AND julianday(expires_at) > julianday('now')`)
      .bind(eventId, user.id).all<{ organization_id: string; value: number }>();
    return c.json({ votes: Object.fromEntries(rows.results.map(row => [row.organization_id, row.value])) });
  });
  app.put('/:id/company-votes/:companyId', async c => {
    const user = await auth(c.env, c.req.raw), eventId = c.req.param('id'), companyId = c.req.param('companyId');
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body) || ![-1, 0, 1].includes(body.value)
      || Object.keys(body).some(key => key !== 'value'))
      throw new HTTPException(400, { message: 'Choose an upvote, downvote, or clear vote.' });
    await eventBallot(c.env.DB, eventId);
    // Clearing physically removes the personal record, including after voting closes.
    if (body.value === 0) {
      await c.env.DB.prepare('DELETE FROM event_company_votes WHERE event_id = ? AND organization_id = ? AND user_id = ?')
        .bind(eventId, companyId, user.id).run();
    } else {
      // Roster, enabled state and deadline are checked atomically with the write.
      const result = await c.env.DB.prepare(`INSERT INTO event_company_votes
        (event_id, organization_id, user_id, value, expires_at)
        SELECT p.event_id, p.organization_id, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', b.closes_at, '+90 days')
        FROM event_pitch_companies p JOIN event_company_ballots b ON b.event_id = p.event_id
        WHERE p.event_id = ? AND p.organization_id = ? AND b.enabled = 1 AND julianday(b.closes_at) > julianday('now')
        ON CONFLICT(event_id, organization_id, user_id) DO UPDATE
        SET value = excluded.value, expires_at = excluded.expires_at, updated_at = CURRENT_TIMESTAMP`)
        .bind(user.id, body.value, eventId, companyId).run();
      if (!result.meta.changes) throw new HTTPException(409, { message: 'Voting is closed or this company is not pitching at this event. Reload votes.' });
    }
    return c.json({ ...await companyVoteSummary(c.env.DB, eventId), company_id: companyId, my_vote: body.value });
  });
  return app;
}
