-- Audit availability visibility changes alongside the existing account availability journal.
INSERT INTO change_journal_coverage VALUES('profile_availability_settings','["user_id", "public", "updated_at"]','[]');
CREATE TRIGGER "journal_profile_availability_settings_insert" AFTER INSERT ON "profile_availability_settings"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('profile_availability_settings',json_object('user_id',NEW."user_id"),'insert',NULL,json_object('user_id',NEW."user_id",'public',NEW."public",'updated_at',NEW."updated_at")); END;
CREATE TRIGGER "journal_profile_availability_settings_update" AFTER UPDATE ON "profile_availability_settings"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."user_id" IS NEW."user_id" AND OLD."public" IS NEW."public" AND OLD."updated_at" IS NEW."updated_at")
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('profile_availability_settings',json_object('user_id',NEW."user_id"),'update',json_object('user_id',OLD."user_id",'public',OLD."public",'updated_at',OLD."updated_at"),json_object('user_id',NEW."user_id",'public',NEW."public",'updated_at',NEW."updated_at")); END;
CREATE TRIGGER "journal_profile_availability_settings_delete" AFTER DELETE ON "profile_availability_settings"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('profile_availability_settings',json_object('user_id',OLD."user_id"),'delete',json_object('user_id',OLD."user_id",'public',OLD."public",'updated_at',OLD."updated_at"),NULL); END;
