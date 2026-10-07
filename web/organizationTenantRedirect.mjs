// Tenant metadata comes from the organization API, never from an organization's source URL.
export function organizationTenantRedirect(organization, currentUrl, currentTenantId = null) {
  if (!organization.tenant_home_url || organization.tenant_id === currentTenantId) return null;
  try {
    const current = new URL(currentUrl);
    const destination = new URL(organization.tenant_home_url);
    if (!['https:', 'http:'].includes(destination.protocol)) return null;
    // The tenant's own organization dashboard must remain reachable on its domain.
    if (destination.origin === current.origin && destination.pathname === '/') return null;
    if (destination.origin === current.origin && destination.pathname === current.pathname) return null;
    for (const [key, value] of current.searchParams) destination.searchParams.append(key, value);
    destination.hash = current.hash;
    return destination.href;
  } catch { return null; }
}
