-- Optional organization-specific public portrait with its source page.
-- No account or identity information is changed; removing membership removes it.
ALTER TABLE organization_memberships ADD COLUMN portrait_json TEXT
 CHECK(portrait_json IS NULL OR (json_valid(portrait_json) AND json_type(portrait_json)='object'));
