-- Reviewed separately from releases: bounded-memory reconciliation for existing
-- public source observations. Index-only; no records or identity links change.
CREATE INDEX IF NOT EXISTS external_financial_fiscal_totals ON external_financial_observations
 (source_system,dataset,CAST(CAST(substr(occurred_at,1,4) AS INTEGER)+(substr(occurred_at,6,2)>='10') AS TEXT),amount_cents,occurred_at);
CREATE INDEX IF NOT EXISTS external_financial_checksums ON external_financial_observations(source_system,source_sha256);
