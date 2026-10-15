import { compareOrganizationActivity } from './organizationSearchActivity';
import { scoreSearchCandidate } from './fuzzySearch';

type SearchRow = Record<string, unknown>;
export type SearchResults = { orgs: SearchRow[]; events: SearchRow[]; users: SearchRow[] };

export async function personalizeSearch(db: D1Database, userId: string, query: string, results: SearchResults): Promise<SearchResults> {
  // Only public candidates enter these queries. Private relationships contribute
  // to ordering, never to response fields or additional visible records.
  const memberships = `SELECT organization_id FROM organization_memberships WHERE user_id = ? AND status = 'active'`;
  const connections = `SELECT CASE WHEN requester_user_id = ? THEN recipient_user_id ELSE requester_user_id END
    FROM user_connections WHERE status = 'accepted' AND (requester_user_id = ? OR recipient_user_id = ?)`;
  const favoriteCompanies = `SELECT organization_id FROM event_company_favorites WHERE user_id = ? AND julianday(expires_at) > julianday('now')`;
  const [orgScores, eventScores, peopleScores] = await Promise.all([
    db.prepare(`SELECT o.id, 60 * (o.id IN (${memberships})) + 45 * (o.id IN (${favoriteCompanies}))
      + 20 * EXISTS (SELECT 1 FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE r.user_id = ? AND e.host_org_id = o.id) AS score
      FROM organizations o WHERE o.id IN (SELECT value FROM json_each(?))`)
      .bind(userId,userId,userId,JSON.stringify(results.orgs.map(row=>row.id))).all<{id:string;score:number}>(),
    db.prepare(`SELECT e.id, 70 * EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.user_id = ?)
      + 60 * COALESCE(e.host_user_id = ?, 0) + 40 * COALESCE(e.host_org_id IN (${memberships}), 0)
      + 25 * COALESCE(e.host_user_id IN (${connections}), 0)
      + 25 * EXISTS (SELECT 1 FROM event_pitch_companies p WHERE p.event_id = e.id AND p.organization_id IN (${favoriteCompanies})) AS score
      FROM events e WHERE e.id IN (SELECT value FROM json_each(?))`)
      .bind(userId,userId,userId,userId,userId,userId,userId,JSON.stringify(results.events.map(row=>row.id))).all<{id:string;score:number}>(),
    db.prepare(`SELECT c.user_id AS id, 65 * (c.user_id IN (${connections}))
      + 30 * EXISTS (SELECT 1 FROM organization_memberships m WHERE m.user_id = c.user_id AND m.status = 'active' AND m.organization_id IN (${memberships}))
      + 20 * EXISTS (SELECT 1 FROM event_registrations them JOIN event_registrations mine ON mine.event_id = them.event_id
        JOIN events e ON e.id = them.event_id WHERE them.user_id = c.user_id AND mine.user_id = ?
        AND COALESCE(e.starts_at,e.event_date) >= date('now')) AS score
      FROM user_contact_pages c WHERE c.user_id IN (SELECT value FROM json_each(?))`)
      .bind(userId,userId,userId,userId,userId,JSON.stringify(results.users.map(row=>row.user_id))).all<{id:string;score:number}>(),
  ]);
  function rank(rows: SearchRow[], scores: {id:string;score:number}[], idField: string, fields: string[], tieBreaker?: (a:SearchRow,b:SearchRow)=>number) {
    const boosts = new Map(scores.map(row=>[row.id,row.score]));
    return rows.map((row,index)=>({row,index,score:scoreSearchCandidate(query,fields.map(field=>row[field])) + (boosts.get(String(row[idField])) || 0)}))
      .sort((a,b)=>b.score-a.score || tieBreaker?.(a.row,b.row) || a.index-b.index).map(item=>item.row);
  }
  return {
    orgs: rank(results.orgs,orgScores.results,'id',['name','description','slug','tags'],compareOrganizationActivity),
    events: rank(results.events,eventScores.results,'id',['title','description','location','organization_name','host_org_name','slug','tags']),
    users: rank(results.users,peopleScores.results,'user_id',['user_name','headline','slug']),
  };
}
