-- Public organization-specific copy, retained with the membership and cleared on erasure.
-- Nullable and bounded; no identity, permission, or personal-profile changes.
ALTER TABLE organization_memberships ADD COLUMN description TEXT
 CHECK(description IS NULL OR length(description)<=600);
