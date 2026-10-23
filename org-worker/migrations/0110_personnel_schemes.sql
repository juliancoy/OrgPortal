-- Organization configuration only; no new personal-data store.
CREATE TABLE organization_personnel_schemes (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 scheme TEXT NOT NULL CHECK(scheme IN ('meetup','nonprofit'))
);
INSERT INTO change_journal_coverage VALUES('organization_personnel_schemes','["organization_id","scheme"]','[]');
CREATE TRIGGER journal_organization_personnel_schemes_insert AFTER INSERT ON organization_personnel_schemes BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json) VALUES('organization_personnel_schemes',json_object('organization_id',NEW.organization_id),'insert',NULL,json_object('organization_id',NEW.organization_id,'scheme',NEW.scheme)); END;
CREATE TRIGGER journal_organization_personnel_schemes_update AFTER UPDATE ON organization_personnel_schemes BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json) VALUES('organization_personnel_schemes',json_object('organization_id',NEW.organization_id),'update',json_object('organization_id',OLD.organization_id,'scheme',OLD.scheme),json_object('organization_id',NEW.organization_id,'scheme',NEW.scheme)); END;
CREATE TRIGGER journal_organization_personnel_schemes_delete AFTER DELETE ON organization_personnel_schemes BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json) VALUES('organization_personnel_schemes',json_object('organization_id',OLD.organization_id),'delete',json_object('organization_id',OLD.organization_id,'scheme',OLD.scheme),NULL); END;
