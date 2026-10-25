// Public application metadata and counts only; never expose voter identities.
export async function organizationCandidates(db:D1Database,organizationId:string){
 const rows=await db.prepare(`SELECT e.id AS event_id,e.slug AS event_slug,e.title AS event_title,s.submission_id,s.title,
  (SELECT COUNT(*) FROM event_submission_favorites f WHERE f.event_id=s.event_id AND f.submission_id=s.submission_id AND f.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS stars
  FROM event_submissions s JOIN events e ON e.id=s.event_id
  WHERE s.organization_id=? AND s.status IN ('submitted','accepted')
   AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
  ORDER BY e.starts_at DESC,e.id,s.submission_id`).bind(organizationId).all<{event_id:string;event_slug:string;event_title:string;submission_id:string;title:string;stars:number}>();
 return rows.results;
}
