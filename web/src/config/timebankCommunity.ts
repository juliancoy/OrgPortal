import { useSyncExternalStore } from 'react'

export type PortalTenant = {
  id: string
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
export async function loadDomainTenant() {
  const response = await fetch('/api/org/api/portal/tenant', { signal: AbortSignal.timeout(5000) })
  if (!response.ok) return
  setDomainTenant(await response.json() as PortalTenant)
}
export async function loadDomainCommunity() { return loadDomainTenant() }
