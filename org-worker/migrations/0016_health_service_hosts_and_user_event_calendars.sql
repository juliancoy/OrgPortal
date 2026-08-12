ALTER TABLE events ADD COLUMN host_user_id TEXT;
ALTER TABLE events ADD COLUMN host_user_name TEXT;

CREATE INDEX IF NOT EXISTS idx_events_host_user_id ON events(host_user_id);

ALTER TABLE health_insurance_services ADD COLUMN host_type TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE health_insurance_services ADD COLUMN host_user_id TEXT;
ALTER TABLE health_insurance_services ADD COLUMN host_user_name TEXT;
ALTER TABLE health_insurance_services ADD COLUMN host_org_id TEXT;
ALTER TABLE health_insurance_services ADD COLUMN host_org_name TEXT;
ALTER TABLE health_insurance_services ADD COLUMN google_calendar_sync INTEGER NOT NULL DEFAULT 0;
ALTER TABLE health_insurance_services ADD COLUMN google_block_busy INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_health_insurance_services_host_user_id
  ON health_insurance_services(host_user_id, active);

CREATE INDEX IF NOT EXISTS idx_health_insurance_services_host_org_id
  ON health_insurance_services(host_org_id, active);
