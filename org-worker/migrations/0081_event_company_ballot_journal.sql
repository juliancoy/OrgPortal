-- Audit public ballot configuration and rosters; exclude individual preferences.

INSERT INTO change_journal_exclusions(table_name,reason) VALUES ('event_company_votes','Private expiring preferences; must not survive erasure in immutable copies');

INSERT INTO change_journal_coverage(table_name,columns_json,redacted_json) VALUES ('event_company_ballots', '["event_id","closes_at","enabled"]', '[]');

CREATE TRIGGER "journal_event_company_ballots_insert" AFTER INSERT ON "event_company_ballots"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('event_company_ballots',json_object('event_id',NEW."event_id"),'insert',NULL,json_object('event_id',NEW."event_id",'closes_at',NEW."closes_at",'enabled',NEW."enabled")); END;

CREATE TRIGGER "journal_event_company_ballots_update" AFTER UPDATE ON "event_company_ballots"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."event_id" IS NEW."event_id" AND OLD."closes_at" IS NEW."closes_at" AND OLD."enabled" IS NEW."enabled")
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('event_company_ballots',json_object('event_id',NEW."event_id"),'update',json_object('event_id',OLD."event_id",'closes_at',OLD."closes_at",'enabled',OLD."enabled"),json_object('event_id',NEW."event_id",'closes_at',NEW."closes_at",'enabled',NEW."enabled")); END;

CREATE TRIGGER "journal_event_company_ballots_delete" AFTER DELETE ON "event_company_ballots"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('event_company_ballots',json_object('event_id',OLD."event_id"),'delete',json_object('event_id',OLD."event_id",'closes_at',OLD."closes_at",'enabled',OLD."enabled"),NULL); END;

INSERT INTO change_journal_coverage(table_name,columns_json,redacted_json) VALUES ('event_pitch_companies', '["event_id","organization_id"]', '[]');

CREATE TRIGGER "journal_event_pitch_companies_insert" AFTER INSERT ON "event_pitch_companies"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('event_pitch_companies',json_object('event_id',NEW."event_id",'organization_id',NEW."organization_id"),'insert',NULL,json_object('event_id',NEW."event_id",'organization_id',NEW."organization_id")); END;

CREATE TRIGGER "journal_event_pitch_companies_update" AFTER UPDATE ON "event_pitch_companies"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."event_id" IS NEW."event_id" AND OLD."organization_id" IS NEW."organization_id")
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('event_pitch_companies',json_object('event_id',NEW."event_id",'organization_id',NEW."organization_id"),'update',json_object('event_id',OLD."event_id",'organization_id',OLD."organization_id"),json_object('event_id',NEW."event_id",'organization_id',NEW."organization_id")); END;

CREATE TRIGGER "journal_event_pitch_companies_delete" AFTER DELETE ON "event_pitch_companies"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('event_pitch_companies',json_object('event_id',OLD."event_id",'organization_id',OLD."organization_id"),'delete',json_object('event_id',OLD."event_id",'organization_id',OLD."organization_id"),NULL); END;
