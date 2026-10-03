import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eventVenues } from './venues';

export async function venueVoteSummary(db: D1Database, eventId: string) {
 const venues = await eventVenues(db, eventId);
 const totals = await db.prepare(`SELECT venue_id, SUM(value = 1) AS upvotes,
  SUM(value = -1) AS downvotes, SUM(value) AS score
  FROM event_venue_votes WHERE event_id = ? GROUP BY venue_id`)
  .bind(eventId).all<{venue_id:string;upvotes:number;downvotes:number;score:number}>();
 const scores = new Map(totals.results.map(row => [row.venue_id, row]));
 return { closed: venues.some(venue => venue.event_status === 'confirmed'), venues: venues.map(venue => {
  const totals = scores.get(venue.id);
  return { ...venue, upvotes: Number(totals?.upvotes || 0), downvotes: Number(totals?.downvotes || 0), score: Number(totals?.score || 0) };
 }) };
}

export function venueVoteRoutes(auth: (env: Env, request: Request) => Promise<{id:string}>) {
 const app = new Hono<{Bindings:Env}>();
 app.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
 async function exists(db:D1Database, id:string) {
  if (!await db.prepare('SELECT id FROM events WHERE id = ?').bind(id).first()) throw new HTTPException(404, {message:'Event not found.'});
 }
 app.get('/:id/venue-votes/public', async c => {
  const id = c.req.param('id'); await exists(c.env.DB, id);
  return c.json(await venueVoteSummary(c.env.DB, id));
 });
 app.get('/:id/venue-votes', async c => {
  const user = await auth(c.env, c.req.raw), id = c.req.param('id'); await exists(c.env.DB, id);
  const rows = await c.env.DB.prepare(`SELECT vv.venue_id, vv.value FROM event_venue_votes vv
   JOIN event_venues ev ON ev.event_id = vv.event_id AND ev.venue_id = vv.venue_id
   WHERE vv.event_id = ? AND vv.user_id = ?`).bind(id, user.id).all<{venue_id:string;value:number}>();
  return c.json({ votes: Object.fromEntries(rows.results.map(row => [row.venue_id, row.value])) });
 });
 app.put('/:id/venue-votes/:venueId', async c => {
  const user = await auth(c.env, c.req.raw), id = c.req.param('id'), venueId = c.req.param('venueId');
  await exists(c.env.DB, id);
  const body = await c.req.json().catch(() => null);
  if (!body || ![-1, 0, 1].includes(body.value) || Object.keys(body).some(key => key !== 'value'))
   throw new HTTPException(400, {message:'Choose an upvote, downvote, or clear vote.'});
  // The candidate and closed-state checks occur in the same statement as the write.
  const result = await c.env.DB.prepare(`INSERT INTO event_venue_votes (event_id, venue_id, user_id, value)
   SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM event_venues WHERE event_id = ? AND venue_id = ? AND status = 'candidate')
   AND NOT EXISTS (SELECT 1 FROM event_venues WHERE event_id = ? AND status = 'confirmed')
   ON CONFLICT(event_id, venue_id, user_id) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
   .bind(id, venueId, user.id, body.value, id, venueId, id).run();
  if (!result.meta.changes) throw new HTTPException(409, {message:'Voting is closed or this venue is no longer a candidate. Reload the event.'});
  return c.json({ ...await venueVoteSummary(c.env.DB, id), venue_id: venueId, my_vote: body.value });
 });
 return app;
}
