-- Extend organization class scheme choices; retain all saved selections and journal records.
DROP TRIGGER journal_organization_personnel_schemes_insert;
DROP TRIGGER journal_organization_personnel_schemes_update;
DROP TRIGGER journal_organization_personnel_schemes_delete;
ALTER TABLE organization_personnel_schemes RENAME TO organization_personnel_schemes_previous;
CREATE TABLE organization_personnel_schemes (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 scheme TEXT NOT NULL CHECK(scheme IN ('meetup','nonprofit','corporation'))
);
INSERT INTO organization_personnel_schemes SELECT * FROM organization_personnel_schemes_previous;
DROP TABLE organization_personnel_schemes_previous;
CREATE TRIGGER journal_organization_personnel_schemes_insert AFTER INSERT ON organization_personnel_schemes BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json) VALUES('organization_personnel_schemes',json_object('organization_id',NEW.organization_id),'insert',NULL,json_object('organization_id',NEW.organization_id,'scheme',NEW.scheme)); END;
CREATE TRIGGER journal_organization_personnel_schemes_update AFTER UPDATE ON organization_personnel_schemes BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json) VALUES('organization_personnel_schemes',json_object('organization_id',NEW.organization_id),'update',json_object('organization_id',OLD.organization_id,'scheme',OLD.scheme),json_object('organization_id',NEW.organization_id,'scheme',NEW.scheme)); END;
CREATE TRIGGER journal_organization_personnel_schemes_delete AFTER DELETE ON organization_personnel_schemes BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json) VALUES('organization_personnel_schemes',json_object('organization_id',OLD.organization_id),'delete',json_object('organization_id',OLD.organization_id,'scheme',OLD.scheme),NULL); END;
