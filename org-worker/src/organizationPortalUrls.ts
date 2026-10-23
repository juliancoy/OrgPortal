import {canonicalOrganizationHref,organizationPagePath} from '../../shared/organizationUrls';
type Site={organization_id?:unknown;home_org_slug?:unknown;home_url?:unknown;public_base_url?:unknown;feature_config?:unknown;home_primary_href?:unknown;home_secondary_href?:unknown};
export async function organizationPortalLinks(db:D1Database,site:Site,base:string) {
 const id=typeof site.organization_id==='string'?site.organization_id:null,legacySlug=typeof site.home_org_slug==='string'?site.home_org_slug:null;
 const organization=id!==null?await db.prepare('SELECT slug FROM organizations WHERE id=?').bind(id).first<{slug:string}>():legacySlug?await db.prepare('SELECT slug FROM organizations WHERE slug=?').bind(legacySlug).first<{slug:string}>():null;
 const slug=organization?.slug||null,path=slug?organizationPagePath(slug):null;
 let config:Record<string,unknown>={};
 try{const raw=typeof site.feature_config==='string'?JSON.parse(site.feature_config):site.feature_config;if(raw&&typeof raw==='object'&&!Array.isArray(raw))config=raw}catch{/* Ignore malformed historical config. */}
 const prior=config.slugPortal;
 const feature_config={...config,slugPortal:{...(prior&&typeof prior==='object'?prior:{}),enabled:!!slug,path}};
 return {home_org_slug:slug,slug_url:path?base.replace(/\/+$/,'')+path:null,
  home_url:canonicalOrganizationHref(typeof site.home_url==='string'?site.home_url:null,slug),
  home_primary_href:canonicalOrganizationHref(typeof site.home_primary_href==='string'?site.home_primary_href:null,slug),
  home_secondary_href:canonicalOrganizationHref(typeof site.home_secondary_href==='string'?site.home_secondary_href:null,slug),
  public_base_url:canonicalOrganizationHref(typeof site.public_base_url==='string'?site.public_base_url:null,slug),
  feature_config:typeof site.feature_config==='string'?JSON.stringify(feature_config):feature_config};
}
