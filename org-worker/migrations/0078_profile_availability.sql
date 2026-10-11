CREATE TABLE profile_availability_settings (
  user_id TEXT PRIMARY KEY,
  public INTEGER NOT NULL DEFAULT 0 CHECK (public IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
