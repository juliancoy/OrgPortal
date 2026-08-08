CREATE TABLE IF NOT EXISTS health_insurance_diagnosis_entries (
  id TEXT PRIMARY KEY,
  patient_user_id TEXT NOT NULL,
  code TEXT NOT NULL,
  submitted_by_user_id TEXT NOT NULL,
  submitted_by_name TEXT NOT NULL,
  self_reported INTEGER NOT NULL DEFAULT 0 CHECK (self_reported IN (0, 1)),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (patient_user_id, code)
);

CREATE INDEX IF NOT EXISTS idx_health_insurance_diagnosis_entries_patient
  ON health_insurance_diagnosis_entries(patient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS health_insurance_diagnosis_supports (
  id TEXT PRIMARY KEY,
  diagnosis_entry_id TEXT NOT NULL REFERENCES health_insurance_diagnosis_entries(id) ON DELETE CASCADE,
  supporter_user_id TEXT NOT NULL,
  supporter_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (diagnosis_entry_id, supporter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_health_insurance_diagnosis_supports_entry
  ON health_insurance_diagnosis_supports(diagnosis_entry_id, created_at);
