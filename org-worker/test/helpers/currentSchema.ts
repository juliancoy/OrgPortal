import { readFileSync } from 'node:fs';

// Partial fixtures apply historical migrations in arbitrary subsets. Translate
// their declarations to the current names; the full migration tests use the
// original SQL and the actual in-place migration, without this helper.
export function readCurrentSchemaFileSync(path: URL, encoding: 'utf8'): string {
  const sql = readFileSync(path, encoding);
  if (!path.pathname.includes('/migrations/') || !path.pathname.endsWith('.sql')) return sql;
  return sql.replaceAll('portal_tenants', 'group_sites')
    .replaceAll('onboarding_tenant_id', 'onboarding_group_site_id')
    .replaceAll('tenant_id', 'group_site_id');
}
