ALTER TABLE portal_tenants ADD COLUMN custom_domain_hostname TEXT;
ALTER TABLE portal_tenants ADD COLUMN custom_domain_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE portal_tenants ADD COLUMN custom_domain_requested_at TEXT;
ALTER TABLE portal_tenants ADD COLUMN custom_domain_attached_at TEXT;
ALTER TABLE portal_tenants ADD COLUMN custom_domain_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_portal_tenants_custom_domain
ON portal_tenants(custom_domain_hostname)
WHERE custom_domain_hostname IS NOT NULL;
