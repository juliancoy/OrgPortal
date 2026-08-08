CREATE TABLE IF NOT EXISTS health_insurance_enrollments (
  user_id TEXT PRIMARY KEY,
  state_code TEXT NOT NULL CHECK (length(state_code) = 2),
  program TEXT NOT NULL CHECK (program IN ('standard', 'pediatric')),
  coverage_effective_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  attested_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS health_insurance_claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  state_code TEXT NOT NULL CHECK (length(state_code) = 2),
  program TEXT NOT NULL CHECK (program IN ('standard', 'pediatric')),
  service_id TEXT NOT NULL REFERENCES health_insurance_services(id),
  service_date TEXT NOT NULL,
  provider_npi TEXT NOT NULL CHECK (length(provider_npi) = 10),
  place_of_service TEXT NOT NULL CHECK (length(place_of_service) = 2),
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'completed', 'declined')),
  coverage_determination TEXT NOT NULL DEFAULT 'available'
    CHECK (coverage_determination IN ('available', 'unavailable')),
  total_billed_usd REAL NOT NULL CHECK (total_billed_usd >= 0),
  code_reference_version TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS health_insurance_diagnoses (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES health_insurance_claims(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
  code TEXT NOT NULL,
  UNIQUE (claim_id, sequence_number),
  UNIQUE (claim_id, code)
);

CREATE TABLE IF NOT EXISTS health_insurance_claim_lines (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES health_insurance_claims(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  code_system TEXT NOT NULL CHECK (code_system IN ('HCPCS_LEVEL_II', 'CPT', 'ICD10_PCS', 'NDC')),
  code TEXT NOT NULL,
  modifiers_json TEXT NOT NULL DEFAULT '[]',
  units INTEGER NOT NULL CHECK (units BETWEEN 1 AND 999),
  billed_amount_usd REAL NOT NULL CHECK (billed_amount_usd >= 0),
  UNIQUE (claim_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_health_insurance_claims_user
  ON health_insurance_claims(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_insurance_claim_lines_claim
  ON health_insurance_claim_lines(claim_id, line_number);
CREATE INDEX IF NOT EXISTS idx_health_insurance_diagnoses_claim
  ON health_insurance_diagnoses(claim_id, sequence_number);

CREATE TABLE IF NOT EXISTS health_insurance_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  slot_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_minutes BETWEEN 15 AND 240),
  capacity_per_slot INTEGER NOT NULL DEFAULT 1 CHECK (capacity_per_slot BETWEEN 1 AND 100),
  available_to_all INTEGER NOT NULL DEFAULT 1 CHECK (available_to_all IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

INSERT OR IGNORE INTO health_insurance_services
  (id, name, description, timezone, slot_minutes, capacity_per_slot, available_to_all, active)
VALUES
  ('primary-care', 'Primary care appointment', 'Request a general health appointment.', 'UTC', 30, 4, 1, 1),
  ('preventive-care', 'Preventive care appointment', 'Request preventive care and screening coordination.', 'UTC', 30, 4, 1, 1),
  ('behavioral-health', 'Behavioral health appointment', 'Request an initial behavioral health appointment.', 'UTC', 30, 4, 1, 1);

CREATE TABLE IF NOT EXISTS health_insurance_service_hours (
  service_id TEXT NOT NULL REFERENCES health_insurance_services(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 5),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  PRIMARY KEY (service_id, weekday),
  CHECK (starts_at < ends_at)
);

INSERT OR IGNORE INTO health_insurance_service_hours (service_id, weekday, starts_at, ends_at)
SELECT service.id, weekdays.weekday, '13:00', '21:00'
FROM health_insurance_services service
CROSS JOIN (
  SELECT 1 AS weekday UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
) weekdays;

CREATE TABLE IF NOT EXISTS health_insurance_appointments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  service_id TEXT NOT NULL REFERENCES health_insurance_services(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'cancelled', 'completed')),
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, starts_at)
);

CREATE INDEX IF NOT EXISTS idx_health_insurance_appointments_slot
  ON health_insurance_appointments(service_id, starts_at, status);
CREATE INDEX IF NOT EXISTS idx_health_insurance_appointments_user
  ON health_insurance_appointments(user_id, starts_at);
