import { z } from 'zod';
import { parseOrganizationThemes, THEME_ID, THEME_COLOR_TOKEN, THEME_COLOR } from '../../shared/organizationThemes';
import { resolveBrandPalette } from '../../shared/brandPalette';
import { authorizeOrganization } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, previewFingerprint, claimEventOperation, finishEventOperation } from './eventOperationStore';

export const portalBrandingTargetSchema = z.object({ organizationId: z.string().min(1).max(200) }).strict();
const themeColorsSchema = z.record(z.string().regex(THEME_COLOR_TOKEN), z.string().regex(THEME_COLOR));
export const organizationThemesSchema = z.object({
  defaultTheme: z.string().regex(THEME_ID),
  themes: z.array(z.object({ id: z.string().regex(THEME_ID), name: z.string().trim().min(1).max(80), light: themeColorsSchema, dark: themeColorsSchema }).strict()).min(1).max(24),
}).strict().refine(value => parseOrganizationThemes(value) !== null, 'Use unique theme IDs, an existing defaultTheme, and matching light/dark keys with 1-128 hex colors per mode');
export const portalBrandingUpdateSchema = portalBrandingTargetSchema.extend({
  brandThemes: organizationThemesSchema.nullable().optional(),
  palette: z.array(z.object({
    label: z.string().trim().min(1).max(80),
    value: z.string().regex(/^#[0-9a-f]{6}$/i),
    description: z.string().max(300).optional(),
  }).strict()).min(1).max(24).optional(),
  nameBannerUrl: z.string().url().max(1000).refine(value => new URL(value).protocol === 'https:' && !new URL(value).username && !new URL(value).password, 'Use an HTTPS image URL').nullable().optional(),
  previewId: z.string().uuid().optional(), confirm: z.boolean().optional(),
}).strict();
type PortalRow = { id: string; profile: string; slug: string | null; home_org_slug: string | null; accent_color: string; theme_color: string | null; feature_config: string; updated_at: string };

export async function runPortalBrandingOperation(db: D1Database, identity: { userId: string; scopes: string[] }, operation: 'get' | 'update', input: unknown) {
  if (!identity.scopes.includes('org:portal.read') || (operation === 'update' && !identity.scopes.includes('org:portal.write')))
    throw new EventIntegrationError(403, 'Missing portal scope');
  const args = operation === 'get' ? portalBrandingTargetSchema.parse(input) : portalBrandingUpdateSchema.parse(input);
  const actor = { id: identity.userId, name: identity.userId, email: null, isOperator: false };
  await enforceEventRateLimit(db, actor.id);
  await authorizeOrganization(db, actor, 'manage', args.organizationId);
  const before = await db.prepare(`SELECT s.id, s.profile, s.slug, s.home_org_slug, s.accent_color, s.theme_color, s.feature_config, s.updated_at
    FROM group_sites s JOIN organizations o ON o.id = ?
    WHERE s.organization_id = o.id OR s.home_org_slug = o.slug
    ORDER BY CASE WHEN s.organization_id = o.id THEN 0 ELSE 1 END LIMIT 1`)
    .bind(args.organizationId).first<PortalRow>();
  if (!before) throw new EventIntegrationError(404, 'Organization portal not found');
  const config = JSON.parse(before.feature_config || '{}');
  const currentBanner = config.nameBannerUrl || null;
  if (operation === 'get') return { organizationId: args.organizationId, portalId: before.id, palette: resolveBrandPalette(before), nameBannerUrl: currentBanner, brandThemes: parseOrganizationThemes(config.brandThemes) };
  const { organizationId, palette, nameBannerUrl, brandThemes, previewId, confirm } = args as z.infer<typeof portalBrandingUpdateSchema>;
  if (palette === undefined && nameBannerUrl === undefined && brandThemes === undefined) throw new EventIntegrationError(400, 'Supply a palette, nameBannerUrl or brandThemes');
  const nextConfig = { ...config, ...(brandThemes === undefined ? {} : { brandThemes }), ...(palette === undefined ? {} : { brandPalette: palette }), ...(nameBannerUrl === undefined ? {} : { nameBannerUrl }) };
  const preview = { brandThemesBefore: parseOrganizationThemes(config.brandThemes), brandThemes: brandThemes === undefined ? parseOrganizationThemes(config.brandThemes) : brandThemes, organizationId, portalId: before.id, before: resolveBrandPalette(before), after: palette ?? resolveBrandPalette(before), nameBannerUrl: nameBannerUrl === undefined ? currentBanner : nameBannerUrl };
  const owner = { userId: actor.id, organizationId, eventId: 'portal:branding' };
  const fingerprint = await previewFingerprint({ ...preview, state: before });
  if (!confirm) return { ...preview, ...await prepareEventOperation(db, owner, fingerprint) };
  if (!previewId) throw new EventIntegrationError(409, 'Request a preview first and supply its previewId');
  await claimEventOperation(db, owner, previewId, fingerprint);
  try {
    const result = await db.prepare(`UPDATE group_sites
      SET feature_config = ?, updated_at = ?
      WHERE id = ? AND feature_config IS ? AND updated_at IS ?
      AND EXISTS (SELECT 1 FROM organization_memberships WHERE organization_id = ? AND user_id = ? AND status = 'active' AND role IN ('owner', 'administrator'))
      RETURNING id, profile, slug, home_org_slug, accent_color, theme_color, feature_config, updated_at`)
      .bind(JSON.stringify(nextConfig), new Date().toISOString(), before.id, before.feature_config, before.updated_at, organizationId, actor.id).first<PortalRow>();
    if (!result) throw new EventIntegrationError(409, 'Branding or management permission changed; request a new preview');
    await finishEventOperation(db, previewId, true, [...(brandThemes === undefined ? [] : ['brandThemes']), ...(palette === undefined ? [] : ['brandPalette']), ...(nameBannerUrl === undefined ? [] : ['nameBannerUrl'])]);
    return { organizationId, portalId: result.id, palette: resolveBrandPalette(result), nameBannerUrl: nextConfig.nameBannerUrl || null, brandThemes: parseOrganizationThemes(nextConfig.brandThemes), previewId };
  } catch (error) {
    await finishEventOperation(db, previewId, false, []);
    throw error;
  }
}
