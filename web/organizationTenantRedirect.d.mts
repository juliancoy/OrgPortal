export function organizationTenantRedirect(
  organization: { tenant_id?: string | null; tenant_home_url?: string | null },
  currentUrl: string,
  currentTenantId?: string | null,
): string | null;
