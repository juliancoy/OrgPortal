-- Only the owner can opt in to publishing their expiring ballot favorites.
CREATE TABLE profile_favorite_company_settings (
  user_id TEXT PRIMARY KEY REFERENCES user_contact_pages(user_id) ON DELETE CASCADE,
  public INTEGER NOT NULL DEFAULT 0 CHECK (public IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('profile_favorite_company_settings','Account sharing preference, read through primary API and removed with contact profile, excluded from public replica and immutable history');
