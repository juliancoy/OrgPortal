-- Pending organizer nominations retain ordinary member permissions.
ALTER TABLE organization_memberships ADD COLUMN pending_organizer INTEGER NOT NULL DEFAULT 0 CHECK (pending_organizer IN (0, 1));
ALTER TABLE organization_memberships ADD COLUMN onboarding_tenant_id TEXT REFERENCES portal_tenants(id);
