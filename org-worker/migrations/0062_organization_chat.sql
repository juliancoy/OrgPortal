CREATE TABLE organization_chat_provisioning (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  generation INTEGER NOT NULL DEFAULT 1,
  last_attempt_at TEXT,
  completed_at TEXT
);

-- The durable job is committed with the organization, regardless of its source.
CREATE TRIGGER organization_chat_created AFTER INSERT ON organizations
BEGIN
  INSERT INTO organization_chat_provisioning (organization_id) VALUES (NEW.id);
END;

CREATE TRIGGER organization_chat_renamed AFTER UPDATE OF name, slug ON organizations
WHEN OLD.name != NEW.name OR OLD.slug != NEW.slug
BEGIN
  INSERT INTO organization_chat_provisioning (organization_id) VALUES (NEW.id)
  ON CONFLICT(organization_id) DO UPDATE SET completed_at = NULL, generation = generation + 1;
END;

INSERT INTO organization_chat_provisioning (organization_id)
SELECT id FROM organizations;

CREATE TRIGGER organization_chat_member_added AFTER INSERT ON organization_memberships
BEGIN
  INSERT INTO organization_chat_provisioning (organization_id) VALUES (NEW.organization_id)
  ON CONFLICT(organization_id) DO UPDATE SET completed_at = NULL, generation = generation + 1;
END;

CREATE TRIGGER organization_chat_member_changed AFTER UPDATE OF role, status, user_name ON organization_memberships
BEGIN
  INSERT INTO organization_chat_provisioning (organization_id) VALUES (NEW.organization_id)
  ON CONFLICT(organization_id) DO UPDATE SET completed_at = NULL, generation = generation + 1;
END;
