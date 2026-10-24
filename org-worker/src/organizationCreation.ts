import { OrganizationIamError, type OrganizationActor } from './organizationIam';

export function organizationCreationIdentity(raw: { name: string; city?: string | null; source_url?: string | null }) {
  let sourceUrl: string | null = null;
  if (raw.source_url?.trim()) {
    try {
      const url = new URL(raw.source_url.trim());
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
      sourceUrl = url.href;
    } catch { throw new OrganizationIamError(400, 'Organization source must be an HTTP(S) URL without credentials'); }
  }
  return { name: raw.name.trim(), city: raw.city?.trim() || null, sourceUrl };
}
export const organizationCreationConflict = `(lower(trim(name)) = lower(?) AND lower(trim(COALESCE(city,''))) = lower(COALESCE(?,''))) OR (? IS NOT NULL AND rtrim(source_url,'/') = rtrim(?,'/'))`;

// Creation is deliberately separate from the directory import/upsert path.
// Creation never updates an existing organization. Internal callers may reuse a
// stable ID for retries only when that organization is already owned by the actor.
export async function insertOwnedOrganization(db: D1Database, actor: OrganizationActor, raw: {
  id?: string; name: string; slug: string; city?: string | null; source_url?: string | null;
  description?: string | null; image_url?: string | null; tags: string;
}) {
  const { name, city, sourceUrl } = organizationCreationIdentity(raw);
  if (raw.id) {
    const owned = await db.prepare("SELECT o.* FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id WHERE o.id=? AND m.user_id=? AND m.role='owner' AND m.status='active'").bind(raw.id,actor.id).first();
    if (owned) return owned;
  }
  const id = raw.id || crypto.randomUUID(), ownershipId = crypto.randomUUID(), now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO organizations (id,name,slug,description,source_url,image_url,tags,city,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE ${organizationCreationConflict})`)
      .bind(id,name,raw.slug,raw.description || null,sourceUrl,raw.image_url || null,raw.tags,city,now,now,name,city,sourceUrl,sourceUrl),
    db.prepare(`INSERT INTO organization_ownerships (id,organization_id,owner_user_id,status,started_at,ended_at)
      SELECT ?,id,?,'active',?,NULL FROM organizations WHERE id=?`).bind(ownershipId,actor.id,now,id),
    db.prepare(`INSERT INTO organization_memberships (organization_id,user_id,user_name,user_email,role,status,created_at,updated_at)
      SELECT id,?,?,?,'owner','active',?,? FROM organizations WHERE id=?`).bind(actor.id,actor.name,actor.email,now,now,id),
    db.prepare(`INSERT INTO audit_events (id,actor_user_id,action,resource_type,resource_id,subject_user_id,metadata_json,created_at)
      SELECT ?,?,'organization.created','organization',id,?,?,? FROM organizations WHERE id=?`)
      .bind(crypto.randomUUID(),actor.id,actor.id,JSON.stringify({ownership_id:ownershipId}),now,id),
  ]);
  const row = await db.prepare('SELECT * FROM organizations WHERE id = ?').bind(id).first();
  if (!row) throw new OrganizationIamError(409, 'Organization already exists; creation cannot replace an existing organization');
  return row;
}
