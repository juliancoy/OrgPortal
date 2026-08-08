ALTER TABLE health_insurance_enrollments
  ADD COLUMN suspected_diagnoses_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE health_insurance_enrollments
  ADD COLUMN issue_summary TEXT NOT NULL DEFAULT '';

ALTER TABLE health_insurance_claims
  ADD COLUMN suspected_diagnoses_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE health_insurance_claims
  ADD COLUMN issue_summary TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS health_insurance_profile_updates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  program TEXT NOT NULL CHECK (program IN ('standard', 'pediatric')),
  coverage_effective_date TEXT NOT NULL,
  suspected_diagnoses_json TEXT NOT NULL DEFAULT '[]',
  issue_summary TEXT NOT NULL DEFAULT '',
  attested_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_health_insurance_profile_updates_user
  ON health_insurance_profile_updates(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS health_insurance_analysis_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  analysis_kind TEXT NOT NULL CHECK (analysis_kind IN ('record-summary', 'triage', 'service-match')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'ready')),
  summary_json TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_health_insurance_analysis_runs_user
  ON health_insurance_analysis_runs(user_id, requested_at DESC);
