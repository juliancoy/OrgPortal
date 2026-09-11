ALTER TABLE portal_tenants ADD COLUMN organization_id TEXT;
ALTER TABLE portal_tenants ADD COLUMN slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_tenants_slug
ON portal_tenants(slug)
WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portal_tenants_organization
ON portal_tenants(organization_id)
WHERE organization_id IS NOT NULL;

UPDATE portal_tenants
SET slug = id
WHERE slug IS NULL AND id <> 'code-collective';
