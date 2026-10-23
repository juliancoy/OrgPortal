import {canonicalOrganizationHref} from '../../shared/organizationUrls';
type PublicPortalRow = {
  id: string; name: string; tagline: string; hostname: string; profile: string;
  brand_image_path?: string | null; accent_color?: string | null;
  features: string; slug: string | null; public_base_url: string | null;
  custom_domain_hostname: string | null; custom_domain_status: string;
  organization_slug?:string|null;
};

export function publicCommunity(row: PublicPortalRow) {
  const destination = row.custom_domain_status === 'attached' && row.custom_domain_hostname
    ? `https://${row.custom_domain_hostname}` : canonicalOrganizationHref(row.public_base_url,row.organization_slug);
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
  const image = row.brand_image_path || (features.includes('timebank') ? '/images/timebank/timebank-mark.svg' : null);
  let logoUrl: string | null = null;
  if (image) {
    try {
      const logo = new URL(image, 'https://orgportal.cc');
      if (logo.protocol === 'https:' && !logo.username && !logo.password && !logo.port
        && !logo.hostname.endsWith('.local') && logo.hostname !== 'localhost') logoUrl = logo.href;
    } catch { /* Invalid branding falls back to the community initials. */ }
  }
  const accentColor = /^#[0-9a-f]{6}$/i.test(row.accent_color || '') ? row.accent_color : null;
  return { id: row.id, name: row.name, tagline: row.tagline, url: url.href, features, logoUrl, accentColor };
}

export async function listPublicCommunities(db: D1Database) {
  const rows = await db.prepare(`SELECT site.id,site.name,site.tagline,site.hostname,site.profile,site.features,
    site.brand_image_path,site.accent_color,site.slug,site.public_base_url,site.custom_domain_hostname,site.custom_domain_status,org.slug AS organization_slug
    FROM group_sites site LEFT JOIN organizations org ON (site.organization_id IS NOT NULL AND org.id=site.organization_id)
     OR (site.organization_id IS NULL AND org.slug=site.home_org_slug)
    WHERE site.profile <> 'orgportal' ORDER BY site.name COLLATE NOCASE`).all<PublicPortalRow>();
  return rows.results.map(publicCommunity).filter(value => value !== null);
}
