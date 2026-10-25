import { parseOrganizationThemes } from '../../shared/organizationThemes';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {canonicalOrganizationHref,organizationPagePath} from '../../shared/organizationUrls';

/** Public brand projection, shared with the org's existing portal/MCP settings. */
export function organizationBrandingRoutes() {
 const app=new Hono<{Bindings:Env}>();
 app.get('/:slug/branding',async c=>{
  c.header('Cache-Control','no-store');
  const org=await c.env.DB.prepare('SELECT id,slug FROM organizations WHERE slug=?').bind(c.req.param('slug')).first<{id:string;slug:string}>();
  if(!org)throw new HTTPException(404,{message:'Organization not found.'});
  const site=await c.env.DB.prepare(`SELECT id,organization_id,slug,hostname,name,tagline,accent_color,profile,features,
   brand_image_path,home_url,home_org_slug,home_image_url,theme_color,feature_config,
   home_kind,home_path,home_heading,home_description,home_primary_label,home_primary_href,home_secondary_label,home_secondary_href
   FROM group_sites WHERE organization_id=? OR (organization_id IS NULL AND home_org_slug=?) ORDER BY CASE WHEN organization_id=? THEN 0 ELSE 1 END,id LIMIT 1`)
   .bind(org.id,org.slug,org.id).first<Record<string,unknown>>();
  if(!site)return c.json({portal:null});
  const parsed=(value:unknown,fallback:unknown)=>{try{return typeof value==='string'?JSON.parse(value):value??fallback}catch{return fallback}};
  const config=parsed(site.feature_config,{}) as Record<string,unknown>;
  let nameBannerUrl:string|undefined;
  try{if(typeof config?.nameBannerUrl==='string'&&config.nameBannerUrl.length<=1000){const url=new URL(config.nameBannerUrl);if(url.protocol==='https:'&&!url.username&&!url.password)nameBannerUrl=config.nameBannerUrl}}catch{/* Omit invalid image URLs from the public guide. */}
  return c.json({portal:{...site,home_org_slug:org.slug,slug_url:organizationPagePath(org.slug),
   home_url:canonicalOrganizationHref(typeof site.home_url==='string'?site.home_url:null,org.slug),
   home_primary_href:canonicalOrganizationHref(typeof site.home_primary_href==='string'?site.home_primary_href:null,org.slug),
   home_secondary_href:canonicalOrganizationHref(typeof site.home_secondary_href==='string'?site.home_secondary_href:null,org.slug),
   features:parsed(site.features,[]),feature_config:{nameBannerUrl,brandThemes:parseOrganizationThemes(config?.brandThemes),brandPalette:config?.brandPalette,specialtyResources:config?.specialtyResources}}});
 });
 return app;
}
