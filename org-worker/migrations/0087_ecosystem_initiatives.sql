CREATE TABLE ecosystem_initiatives (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(revision>=1),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX ecosystem_initiatives_updated ON ecosystem_initiatives(updated_at DESC,id);
CREATE TRIGGER ecosystem_initiative_revision BEFORE UPDATE ON ecosystem_initiatives
WHEN NEW.revision!=OLD.revision+1 OR NEW.organization_id!=OLD.organization_id
BEGIN SELECT RAISE(ABORT,'Initiative changed; reload before saving'); END;
CREATE TABLE ecosystem_initiative_versions (
 initiative_id TEXT NOT NULL REFERENCES ecosystem_initiatives(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), recorded_at TEXT NOT NULL,
 PRIMARY KEY(initiative_id,revision)
);
CREATE TRIGGER ecosystem_initiative_version_insert AFTER INSERT ON ecosystem_initiatives
BEGIN INSERT INTO ecosystem_initiative_versions VALUES(NEW.id,NEW.revision,NEW.payload_json,NEW.updated_at); END;
CREATE TRIGGER ecosystem_initiative_version_update AFTER UPDATE ON ecosystem_initiatives
BEGIN INSERT INTO ecosystem_initiative_versions VALUES(NEW.id,NEW.revision,NEW.payload_json,NEW.updated_at); END;
