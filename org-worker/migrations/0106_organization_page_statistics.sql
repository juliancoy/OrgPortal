-- Anonymous organization-page counts only: no IPs, accounts, referrers or visit IDs.
CREATE TABLE organization_page_view_totals (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 views INTEGER NOT NULL DEFAULT 0 CHECK(views>=0),
 first_day TEXT NOT NULL,
 last_day TEXT NOT NULL
);
CREATE TABLE organization_page_view_days (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 day TEXT NOT NULL,
 views INTEGER NOT NULL DEFAULT 0 CHECK(views>=0),
 PRIMARY KEY(organization_id,day)
);
CREATE INDEX organization_page_view_expiry ON organization_page_view_days(day);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('organization_page_view_totals','Anonymous aggregate page counts; organization lifecycle; no per-view immutable journal'),
 ('organization_page_view_days','Anonymous daily page counts; 365-day expiry; no immutable journal or public replica');
