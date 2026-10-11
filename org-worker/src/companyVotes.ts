import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

export type CompanyBallot = { closes_at: string; enabled: number; mode: 'up_down' | 'favorites'; selection_fraction: number };
export function favoriteLimit(companyCount: number, fraction: number) { return Math.ceil(companyCount * fraction); }
// SQLite expression deliberately matches the rounded-up public limit.
export const favoriteLimitSql = `(CAST((SELECT COUNT(*) FROM event_pitch_companies WHERE event_id = b.event_id) * b.selection_fraction AS INTEGER)
  + ((SELECT COUNT(*) FROM event_pitch_companies WHERE event_id = b.event_id) * b.selection_fraction > CAST((SELECT COUNT(*) FROM event_pitch_companies WHERE event_id = b.event_id) * b.selection_fraction AS INTEGER)))`;

export async function eventBallot(db: D1Database, eventId: string) {
  const event = await db.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first();
  if (!event) throw new HTTPException(404, { message: 'Event not found.' });
  return db.prepare('SELECT closes_at, enabled, mode, selection_fraction FROM event_company_ballots WHERE event_id = ?')
    .bind(eventId).first<CompanyBallot>();
}

export async function companyVoteSummary(db: D1Database, eventId: string) {
  const ballot = await eventBallot(db, eventId);
  if (!ballot) return { available: false, closed: true, closes_at: null, companies: [] };
  const favorites = ballot.mode === 'favorites';
  const rows = await db.prepare(`SELECT o.id, o.name, o.slug, o.image_url, o.description,
    ${favorites ? 'COUNT(v.user_id)' : 'COALESCE(SUM(v.value = 1), 0)'} AS upvotes,
    ${favorites ? '0' : 'COALESCE(SUM(v.value = -1), 0)'} AS downvotes,
    ${favorites ? 'COUNT(v.user_id)' : 'COALESCE(SUM(v.value), 0)'} AS score
    FROM event_pitch_companies p JOIN organizations o ON o.id = p.organization_id
    LEFT JOIN ${favorites ? 'event_company_favorites' : 'event_company_votes'} v ON v.event_id = p.event_id AND v.organization_id = p.organization_id
      AND julianday(v.expires_at) > julianday('now')
    WHERE p.event_id = ? GROUP BY o.id ORDER BY ${favorites ? 'lower(o.name), o.id' : 'score DESC, lower(o.name), o.id'}`)
    .bind(eventId).all();
  return { available: true, closed: !ballot.enabled || Date.parse(ballot.closes_at) <= Date.now(),
    closes_at: ballot.closes_at, mode: ballot.mode, selection_fraction: ballot.selection_fraction,
    selection_limit: favorites ? favoriteLimit(rows.results.length, ballot.selection_fraction) : null, companies: rows.results };
}

export async function ownCompanyVotes(db: D1Database, eventId: string, userId: string) {
  const ballot = await eventBallot(db, eventId);
  const favorites = ballot?.mode === 'favorites';
  const rows = await db.prepare(`SELECT organization_id, ${favorites ? '1' : 'value'} AS value FROM ${favorites ? 'event_company_favorites' : 'event_company_votes'}
    WHERE event_id = ? AND user_id = ? AND julianday(expires_at) > julianday('now')`)
    .bind(eventId, userId).all<{ organization_id: string; value: number }>();
  return { votes: Object.fromEntries(rows.results.map(row => [row.organization_id, row.value])) };
}

export async function saveCompanyVote(db: D1Database, eventId: string, companyId: string, userId: string, value: number, expectedMode?: string) {
  if (![-1, 0, 1].includes(value)) throw new HTTPException(400, { message: 'Invalid company vote.' });
  const ballot = await eventBallot(db, eventId);
  if (expectedMode && ballot?.mode !== expectedMode) throw new HTTPException(409, { message: 'Voting mode changed. Reload votes.' });
  const favorites = ballot?.mode === 'favorites';
  if (favorites && value === -1) throw new HTTPException(400, { message: 'Favorites voting has no downvotes.' });
  if (value === 0) {
    // Clearing physically removes the personal record, even after voting closes.
    await db.prepare(`DELETE FROM ${favorites ? 'event_company_favorites' : 'event_company_votes'} WHERE event_id = ? AND organization_id = ? AND user_id = ?
      AND EXISTS (SELECT 1 FROM event_company_ballots WHERE event_id = ? AND mode = ?)` )
      .bind(eventId, companyId, userId, eventId, favorites ? 'favorites' : 'up_down').run();
  } else if (favorites) {
    // One atomic statement checks roster, deadline, mode and this account's remaining budget.
    // Excluding this company makes repeated selection idempotent even at the limit.
    const result = await db.prepare(`INSERT INTO event_company_favorites (event_id,organization_id,user_id,expires_at)
      SELECT p.event_id,p.organization_id,?,strftime('%Y-%m-%dT%H:%M:%SZ',b.closes_at,'+90 days')
      FROM event_pitch_companies p JOIN event_company_ballots b ON b.event_id = p.event_id
      WHERE p.event_id = ? AND p.organization_id = ? AND b.mode = 'favorites' AND b.enabled = 1 AND julianday(b.closes_at) > julianday('now')
      AND (SELECT COUNT(*) FROM event_company_favorites f WHERE f.event_id = b.event_id AND f.user_id = ?
        AND f.organization_id != p.organization_id AND julianday(f.expires_at) > julianday('now')) < ${favoriteLimitSql}
      ON CONFLICT(event_id,organization_id,user_id) DO UPDATE SET expires_at = excluded.expires_at`)
      .bind(userId, eventId, companyId, userId).run();
    if (!result.meta.changes) throw new HTTPException(409, { message: 'Favorite limit reached, voting closed, or company roster changed. Deselect a favorite or reload votes.' });
  } else {
    const result = await db.prepare(`INSERT INTO event_company_votes (event_id,organization_id,user_id,value,expires_at)
      SELECT p.event_id,p.organization_id,?,?,strftime('%Y-%m-%dT%H:%M:%SZ',b.closes_at,'+90 days')
      FROM event_pitch_companies p JOIN event_company_ballots b ON b.event_id = p.event_id
      WHERE p.event_id = ? AND p.organization_id = ? AND b.mode = 'up_down' AND b.enabled = 1 AND julianday(b.closes_at) > julianday('now')
      ON CONFLICT(event_id,organization_id,user_id) DO UPDATE SET value = excluded.value,expires_at = excluded.expires_at,updated_at = CURRENT_TIMESTAMP`)
      .bind(userId, value, eventId, companyId).run();
    if (!result.meta.changes) throw new HTTPException(409, { message: 'Voting is closed or this company is not pitching at this event. Reload votes.' });
  }
  return { ...await companyVoteSummary(db, eventId), ...await ownCompanyVotes(db, eventId, userId), company_id: companyId, my_vote: value };
}

export function companyVoteRoutes(auth: (env: Env, request: Request) => Promise<{ id: string }>) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
  app.get('/:id/company-votes/public', async c => c.json(await companyVoteSummary(c.env.DB, c.req.param('id'))));
  app.get('/:id/company-votes', async c => {
    const user = await auth(c.env, c.req.raw);
    return c.json(await ownCompanyVotes(c.env.DB, c.req.param('id'), user.id));
  });
  app.put('/:id/company-votes/:companyId', async c => {
    const user = await auth(c.env, c.req.raw);
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body) || ![-1,0,1].includes(body.value)
      || Object.keys(body).some(key => !['value','mode'].includes(key))
      || (body.mode !== undefined && !['up_down','favorites'].includes(body.mode)))
      throw new HTTPException(400, { message: 'Choose an upvote, downvote, or clear vote with a valid voting mode.' });
    return c.json(await saveCompanyVote(c.env.DB, c.req.param('id'), c.req.param('companyId'), user.id, body.value, body.mode || 'up_down'));
  });
  return app;
}
