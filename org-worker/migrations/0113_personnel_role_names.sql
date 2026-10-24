-- Optional presentation title; retains the existing class, access and confirmation rules.
-- Same expiry, erasure and private-store policy as the parent relationship.
ALTER TABLE organization_personnel_relationships ADD COLUMN role_name TEXT CHECK(role_name IS NULL OR (length(role_name) BETWEEN 1 AND 100));
