import { isLifeTechMedicalEvent, lifeTechEventCategory, type MedicalEventCandidate } from '../../shared/eventRelevance';
import { Hono } from 'hono';

// SQLite accepts ISO offsets with a colon; imported calendars also use -0500.
// Normalize each timestamp before parsing so an invalid end cannot hide a valid start.
const julian = (column: string) => `julianday(CASE WHEN substr(${column},-5,1) IN ('+','-') AND substr(${column},-4) GLOB '[0-9][0-9][0-9][0-9]'
  THEN substr(${column},1,length(${column})-2) || ':' || substr(${column},-2) ELSE ${column} END)`;
const starts = `COALESCE(${julian('e.starts_at')},julianday(e.event_date || 'T12:00:00Z'))`;

/** Rank existing public events without retaining a second copy of account activity. */
export function eventRecommendationRoutes<Env extends { DB: D1Database }, Row>(
  auth: (env: Env, request: Request) => Promise<{ id: string }>,
  mapEvent: (env: Env, request: Request, row: Row) => Promise<object>,
) {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/events/recommended', async c => {
    c.header('Cache-Control', 'private, no-store');
    c.header('Vary', 'Authorization');
    const user = c.req.header('Authorization') ? await auth(c.env, c.req.raw) : null;
    const limit = Math.max(1, Math.min(parseInt(c.req.query('limit') || '25', 10) || 25, 100));
    const offset = Math.max(0, Math.min(parseInt(c.req.query('offset') || '0', 10) || 0, 100000));
    const today = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const community = c.req.query('community') === 'lifetech';
    const category = c.req.query('category') || 'all';
    const query = (c.req.query('q') || '').trim().toLowerCase();
    const period = ['upcoming','past'].includes(c.req.query('period') || '') ? c.req.query('period')! : 'all';
    const boundary = (key: string) => {
      const raw = c.req.query(key) || '';
      return raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
    };
    let context: {id:string;community:number}[] = [];
    if (community) {
      // Classify lightweight candidates on the server, before pagination. The
      // browser never downloads the full regional import just to discard it.
      const candidates = await c.env.DB.prepare(`SELECT e.id,e.title,e.description,e.tags,e.host_org_id,e.starts_at,e.event_date,
        o.name AS organization_name,e.host_org_name,
        EXISTS (SELECT 1 FROM event_registrations mine WHERE mine.event_id=e.id AND mine.user_id=?) AS registered,
        CASE WHEN o.slug IN ('lifetech','baltimore-medtech') OR EXISTS (
          SELECT 1 FROM event_organizations eo JOIN organizations related ON related.id=eo.organization_id
          WHERE eo.event_id=e.id AND related.slug IN ('lifetech','baltimore-medtech')
        ) THEN 1 ELSE 0 END AS community_event
        FROM events e LEFT JOIN organizations o ON o.id=e.host_org_id
        ORDER BY community_event DESC,registered DESC,e.id`).bind(user?.id ?? null).all<MedicalEventCandidate & {id:string;tags:string;community_event:number;starts_at:string|null;event_date:string|null}>();
      const seen = new Set<string>();
      context = candidates.results.flatMap(row => {
        let tags: unknown = [];
        try { tags=JSON.parse(row.tags || '[]'); } catch { /* Invalid tags cannot establish relevance. */ }
        const event={...row,tags};
        if (!row.community_event && !isLifeTechMedicalEvent(event)) return [];
        if (category === 'community' && !row.community_event) return [];
        if (['biotech','medical'].includes(category) && lifeTechEventCategory(event) !== category) return [];
        const text=[row.title,row.description,row.organization_name,row.host_org_name,JSON.stringify(tags)].join(' ').toLowerCase();
        if (query && !query.split(/\s+/).every(term=>text.includes(term))) return [];
        const date=Date.parse(row.starts_at || row.event_date || '');
        const key=`${(row.title || '').toLowerCase().replace(/\s+/g,' ').trim()}|${Number.isFinite(date) ? date : row.id}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{id:row.id,community:row.community_event}];
      });
    }
    // Aggregate once, then rank every candidate before LIMIT. History is restricted
    // to the last year, and capped so prolific hosts cannot swamp explicit choices.
    const rows = await c.env.DB.prepare(`WITH
      viewer AS (SELECT ? AS id),
      context AS (SELECT json_extract(value,'$.id') AS id, json_extract(value,'$.community') AS community FROM json_each(?)),
      options AS (SELECT ? AS scoped, ? AS period, ? AS after, ? AS before, ? AS chronological, ? AS today),
      registrations AS (SELECT event_id, COUNT(*) AS n FROM event_registrations GROUP BY event_id),
      members AS (SELECT organization_id, COUNT(*) AS n FROM organization_memberships WHERE status = 'active' GROUP BY organization_id),
      history AS (
        SELECT past.host_org_id, past.host_user_id, COUNT(*) AS n
        FROM event_registrations r JOIN events past ON past.id = r.event_id
        WHERE r.user_id = (SELECT id FROM viewer)
          AND COALESCE(${julian('past.starts_at')},julianday(past.event_date)) BETWEEN julianday('now','-1 year') AND julianday('now')
        GROUP BY past.host_org_id, past.host_user_id
      ),
      ranked AS (
        SELECT e.id, COALESCE(x.community,0) AS community,
          CASE WHEN e.starts_at IS NULL AND e.event_date IS NOT NULL
            THEN e.event_date < (SELECT today FROM options)
            ELSE COALESCE(${julian('e.ends_at')},${julian('e.starts_at')},julianday(e.event_date || 'T23:59:59Z'),julianday('now')) < julianday('now') END AS past,
          100 * EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.user_id = (SELECT id FROM viewer))
          + 90 * COALESCE(e.host_user_id = (SELECT id FROM viewer),0)
          + 60 * EXISTS (SELECT 1 FROM organization_follows f WHERE f.organization_id = e.host_org_id AND f.user_id = (SELECT id FROM viewer))
          + 50 * EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id = e.host_org_id AND m.user_id = (SELECT id FROM viewer) AND m.status = 'active')
          + 10 * MIN(5, COALESCE((SELECT SUM(h.n) FROM history h WHERE
              (e.host_org_id IS NOT NULL AND h.host_org_id = e.host_org_id)
              OR (e.host_user_id IS NOT NULL AND h.host_user_id = e.host_user_id)),0))
          + 80 * COALESCE(x.community,0)
          + MIN(10,COALESCE(r.n,0)) + MIN(10,COALESCE(m.n,0)) AS relevance,
          ${starts} AS starts
        FROM events e LEFT JOIN registrations r ON r.event_id = e.id
        LEFT JOIN members m ON m.organization_id = e.host_org_id
        LEFT JOIN context x ON x.id=e.id
        WHERE ((SELECT scoped FROM options)=0 OR x.id IS NOT NULL)
      )
      SELECT e.*, k.community AS community_event, o.name AS organization_name, o.slug AS organization_slug,
        o.image_url AS organization_image_url, o.links_json AS organization_links_json
      FROM ranked k JOIN events e ON e.id = k.id LEFT JOIN organizations o ON o.id = e.host_org_id
      WHERE ((SELECT period FROM options)='all' OR k.past=CASE WHEN (SELECT period FROM options)='past' THEN 1 ELSE 0 END)
        AND ((SELECT after FROM options) IS NULL OR ${starts} >= julianday((SELECT after FROM options)))
        AND ((SELECT before FROM options) IS NULL OR ${starts} < julianday((SELECT before FROM options)))
      ORDER BY CASE WHEN (SELECT chronological FROM options)=1 THEN 0 ELSE k.past END ASC, CASE WHEN k.past = 0 AND (SELECT chronological FROM options)=0 THEN k.relevance END DESC,
        k.starts IS NULL, CASE WHEN k.past = 0 OR (SELECT chronological FROM options)=1 THEN k.starts END ASC,
        CASE WHEN k.past = 1 THEN k.starts END DESC, e.id ASC LIMIT ? OFFSET ?`)
      .bind(user?.id ?? null, JSON.stringify(context), community ? 1 : 0, period, boundary('from'), boundary('to'), c.req.query('sort') === 'date' ? 1 : 0, today, limit, offset).all<Row & {community_event:number}>();
    return c.json(await Promise.all(rows.results.map(async row => ({...await mapEvent(c.env, c.req.raw, row), community_event:Boolean(row.community_event)}))));
  });
  return app;
}
