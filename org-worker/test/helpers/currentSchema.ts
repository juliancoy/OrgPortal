import { readFileSync } from 'node:fs';

// Partial fixtures apply historical migrations in arbitrary subsets. Translate
// their declarations to the current names; the full migration tests use the
// original SQL and the actual in-place migration, without this helper.
export function readCurrentSchemaFileSync(path: URL, encoding: 'utf8'): string {
  const sql = readFileSync(path, encoding);
  if (!path.pathname.includes('/migrations/') || !path.pathname.endsWith('.sql')) return sql;
  const current = path.pathname.endsWith('/0002_org_event_directories.sql') ? sql.replace('CREATE TABLE IF NOT EXISTS organizations (', "CREATE TABLE IF NOT EXISTS organizations (links_json TEXT NOT NULL DEFAULT '[]',") : sql;
  return current.replaceAll('portal_tenants', 'group_sites')
    .replaceAll('onboarding_tenant_id', 'onboarding_group_site_id')
    .replaceAll('tenant_id', 'group_site_id');
}
