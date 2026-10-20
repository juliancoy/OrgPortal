import type { GroupSite } from './timebankCommunity'

export type TenantHomeAction =
  | { kind: 'landing' }
  | { kind: 'events' }
  | { kind: 'timebank' }
  | { kind: 'redirect'; to: string }

export function internalTenantHomePath(path?: string | null) {
  const raw = String(path || '').trim()
  if (!raw.startsWith('/')) return null
  try {
    const url = new URL(raw, 'https://portal.invalid')
    if (url.origin !== 'https://portal.invalid') return null
    if (url.pathname === '/' || url.pathname.startsWith('/auth/callback') || url.pathname.startsWith('/users/login')) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function tenantHomeAction(
  tenant: GroupSite,
  role: string,
  memberHomePath: string,
): TenantHomeAction {
  // Keep LifeTech's public home independent of authentication and saved views.
  if (tenant.home_org_slug === 'lifetech') return { kind: 'landing' }
  const kind = tenant.home_kind || (tenant.features?.includes('timebank') ? 'timebank' : 'default')
  if (kind === 'landing' || kind === 'main') return { kind: 'landing' }
  if (kind === 'timebank') return { kind: 'timebank' }
  if (kind === 'auth') return { kind: 'redirect', to: role === 'guest' ? '/users/login' : memberHomePath }
  if (kind === 'org' && tenant.home_org_slug) return { kind: 'redirect', to: `/orgs/${encodeURIComponent(tenant.home_org_slug)}` }
  if (kind === 'org-events' && tenant.home_org_slug) return { kind: 'events' }
  if (kind === 'route') {
    const path = internalTenantHomePath(tenant.home_path || tenant.member_home_path)
    return path ? { kind: 'redirect', to: path } : { kind: 'landing' }
  }
  return { kind: 'landing' }
}
