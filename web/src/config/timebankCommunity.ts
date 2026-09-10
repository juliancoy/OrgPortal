import { useSyncExternalStore } from 'react'

export type PortalTenant = {
  id: string
  organization_id?: string | null
  slug?: string | null
  slug_url?: string | null
  hostname: string
  name: string
  tagline: string
  accent_color: string
  profile?: string
  features?: string[]
  brand_image_path?: string | null
  home_url?: string | null
  member_home_path?: string | null
  manifest_path?: string | null
  theme_color?: string | null
  home_kind?: 'default' | 'landing' | 'route' | 'org' | 'org-events' | 'timebank' | 'auth' | null
  home_path?: string | null
  home_org_slug?: string | null
  home_heading?: string | null
  home_description?: string | null
  home_primary_label?: string | null
  home_primary_href?: string | null
  home_secondary_label?: string | null
  home_secondary_href?: string | null
  home_image_url?: string | null
  public_base_url?: string | null
  canonical_path_prefix?: string | null
  feature_config?: Record<string, unknown>
}
export type TimebankCommunity = PortalTenant
let tenant: PortalTenant | null = null
const listeners = new Set<() => void>()
export function getDomainTenant() { return tenant?.id !== 'code-collective' ? tenant : null }
export function getDomainCommunity() {
  const domainTenant = getDomainTenant()
  return domainTenant?.features?.includes('timebank') ? domainTenant : null
}
export function timebankHomePath() { return getDomainCommunity() ? '/' : '/timebanking' }
export function setDomainTenant(value: PortalTenant | null) {
  tenant = value
  for (const listener of listeners) listener()
}
export function setDomainCommunity(value: TimebankCommunity) { setDomainTenant(value) }
export function useDomainCommunity() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, getDomainCommunity, () => null)
}
export function useDomainTenant() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, getDomainTenant, () => null)
}
const HOME_KINDS = new Set(['default', 'landing', 'route', 'org', 'org-events', 'timebank', 'auth'])

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function optionalObject(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

export function parsePortalTenant(value: unknown): PortalTenant | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const id = optionalString(input.id)
  const hostname = optionalString(input.hostname)
  const name = optionalString(input.name)
  if (!id || !hostname || !name) return null
  const rawFeatures = Array.isArray(input.features) ? input.features : []
  const features = rawFeatures.filter((feature): feature is string => typeof feature === 'string' && Boolean(feature.trim())).map((feature) => feature.trim())
  const homeKind = optionalString(input.home_kind)
  return {
    id,
    organization_id: optionalString(input.organization_id),
    slug: optionalString(input.slug),
    slug_url: optionalString(input.slug_url),
    hostname,
    name,
    tagline: optionalString(input.tagline) || '',
    accent_color: optionalString(input.accent_color) || '#155e59',
    profile: optionalString(input.profile) || 'community',
    features,
    brand_image_path: optionalString(input.brand_image_path),
    home_url: optionalString(input.home_url),
    member_home_path: optionalString(input.member_home_path),
    manifest_path: optionalString(input.manifest_path),
    theme_color: optionalString(input.theme_color),
    home_kind: homeKind && HOME_KINDS.has(homeKind) ? homeKind as PortalTenant['home_kind'] : null,
    home_path: optionalString(input.home_path),
    home_org_slug: optionalString(input.home_org_slug),
    home_heading: optionalString(input.home_heading),
    home_description: optionalString(input.home_description),
    home_primary_label: optionalString(input.home_primary_label),
    home_primary_href: optionalString(input.home_primary_href),
    home_secondary_label: optionalString(input.home_secondary_label),
    home_secondary_href: optionalString(input.home_secondary_href),
    home_image_url: optionalString(input.home_image_url),
    public_base_url: optionalString(input.public_base_url),
    canonical_path_prefix: optionalString(input.canonical_path_prefix),
    feature_config: optionalObject(input.feature_config),
  }
}

export async function loadDomainTenant() {
  const response = await fetch('/api/org/api/portal/tenant', { signal: AbortSignal.timeout(5000) })
  if (!response.ok) return
  const parsed = parsePortalTenant(await response.json())
  if (parsed) setDomainTenant(parsed)
}
export async function loadDomainCommunity() { return loadDomainTenant() }
