type PublicPortalRow = {
  id: string; name: string; tagline: string; hostname: string; profile: string;
  features: string; slug: string | null; public_base_url: string | null;
  custom_domain_hostname: string | null; custom_domain_status: string;
};

export function publicCommunity(row: PublicPortalRow) {
  const destination = row.custom_domain_status === 'attached' && row.custom_domain_hostname
    ? `https://${row.custom_domain_hostname}` : row.public_base_url;
  if (!destination || row.profile === 'orgportal') return null;
  let url: URL;
  try { url = new URL(destination); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || url.hostname.endsWith('.local') || url.hostname === 'localhost') return null;
  let features: string[] = [];
  try {
    const parsed = JSON.parse(row.features);
    if (Array.isArray(parsed)) features = parsed.filter((value): value is string => typeof value === 'string');
  } catch { /* A missing feature list does not grant features. */ }
  return { id: row.id, name: row.name, tagline: row.tagline, url: url.href, features };
}

export async function listPublicCommunities(db: D1Database) {
  const rows = await db.prepare(`SELECT id, name, tagline, hostname, profile, features,
    slug, public_base_url, custom_domain_hostname, custom_domain_status
    FROM portal_tenants WHERE profile <> 'orgportal' ORDER BY name COLLATE NOCASE`).all<PublicPortalRow>();
  return rows.results.map(publicCommunity).filter(value => value !== null);
}
