-- Private, admin-controlled service activation. Missing settings mean disabled.
CREATE TABLE support_settings (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('support_settings','Private organization-admin service activation configuration.');
