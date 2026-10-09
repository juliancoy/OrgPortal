-- Preserve existing up/down preferences separately from bounded favorites.
ALTER TABLE event_company_ballots ADD COLUMN mode TEXT NOT NULL DEFAULT 'up_down' CHECK (mode IN ('up_down','favorites'));
ALTER TABLE event_company_ballots ADD COLUMN selection_fraction REAL NOT NULL DEFAULT 0.25 CHECK (selection_fraction > 0 AND selection_fraction <= 1);
CREATE TABLE event_company_favorites (
  event_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK (julianday(expires_at) IS NOT NULL),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, organization_id, user_id),
  FOREIGN KEY (event_id, organization_id) REFERENCES event_pitch_companies(event_id, organization_id) ON DELETE CASCADE
);
CREATE INDEX event_company_favorites_expiry ON event_company_favorites(expires_at);
CREATE INDEX event_company_favorites_user ON event_company_favorites(user_id,event_id);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES ('event_company_favorites','Private expiring favorites; excluded from immutable history and public replication');
UPDATE change_journal_coverage SET columns_json = '["event_id","closes_at","enabled","mode","selection_fraction"]' WHERE table_name = 'event_company_ballots';
DROP TRIGGER journal_event_company_ballots_insert;
DROP TRIGGER journal_event_company_ballots_update;
DROP TRIGGER journal_event_company_ballots_delete;
CREATE TRIGGER journal_event_company_ballots_insert AFTER INSERT ON event_company_ballots
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('event_company_ballots',json_object('event_id',NEW.event_id),'insert',NULL,json_object('event_id',NEW.event_id,'closes_at',NEW.closes_at,'enabled',NEW.enabled,'mode',NEW.mode,'selection_fraction',NEW.selection_fraction)); END;
CREATE TRIGGER journal_event_company_ballots_update AFTER UPDATE ON event_company_ballots
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
 AND NOT(OLD.event_id IS NEW.event_id AND OLD.closes_at IS NEW.closes_at AND OLD.enabled IS NEW.enabled AND OLD.mode IS NEW.mode AND OLD.selection_fraction IS NEW.selection_fraction)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('event_company_ballots',json_object('event_id',NEW.event_id),'update',json_object('event_id',OLD.event_id,'closes_at',OLD.closes_at,'enabled',OLD.enabled,'mode',OLD.mode,'selection_fraction',OLD.selection_fraction),json_object('event_id',NEW.event_id,'closes_at',NEW.closes_at,'enabled',NEW.enabled,'mode',NEW.mode,'selection_fraction',NEW.selection_fraction)); END;
CREATE TRIGGER journal_event_company_ballots_delete AFTER DELETE ON event_company_ballots
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('event_company_ballots',json_object('event_id',OLD.event_id),'delete',json_object('event_id',OLD.event_id,'closes_at',OLD.closes_at,'enabled',OLD.enabled,'mode',OLD.mode,'selection_fraction',OLD.selection_fraction),NULL); END;
