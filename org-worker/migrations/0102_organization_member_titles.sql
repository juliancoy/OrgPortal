-- Informational titles belong to a membership; authorization still uses role/status.
-- Deleting the membership also deletes its titles. Existing memberships start empty.
ALTER TABLE organization_memberships ADD COLUMN titles_json TEXT NOT NULL DEFAULT '[]'
 CHECK(json_valid(titles_json) AND json_type(titles_json)='array' AND json_array_length(titles_json)<=8);
