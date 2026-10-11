-- Sites are group presentation configuration, never identity tenants.
-- Rename in place: memberships, progress, task IDs, and immutable history survive.
DROP TRIGGER "organization_chat_member_added";
DROP TRIGGER "organization_chat_member_changed";
DROP TRIGGER "organization_status_added";
DROP TRIGGER "organization_status_changed";
DROP TRIGGER "organization_status_removed";
DROP TRIGGER "journal_availability_polls_insert";
DROP TRIGGER "journal_availability_polls_update";
DROP TRIGGER "journal_availability_polls_delete";
DROP TRIGGER "journal_member_meeting_preferences_insert";
DROP TRIGGER "journal_member_meeting_preferences_update";
DROP TRIGGER "journal_member_meeting_preferences_delete";
DROP TRIGGER "journal_member_meetings_insert";
DROP TRIGGER "journal_member_meetings_update";
DROP TRIGGER "journal_member_meetings_delete";
DROP TRIGGER "journal_onboarding_enrollments_insert";
DROP TRIGGER "journal_onboarding_enrollments_update";
DROP TRIGGER "journal_onboarding_enrollments_delete";
DROP TRIGGER "journal_organization_memberships_insert";
DROP TRIGGER "journal_organization_memberships_update";
DROP TRIGGER "journal_organization_memberships_delete";
DROP TRIGGER "journal_photo_annotations_insert";
DROP TRIGGER "journal_photo_annotations_update";
DROP TRIGGER "journal_photo_annotations_delete";
DROP TRIGGER "journal_portal_tenants_insert";
DROP TRIGGER "journal_portal_tenants_update";
DROP TRIGGER "journal_portal_tenants_delete";
DROP TRIGGER "journal_user_hidden_carousel_images_insert";
DROP TRIGGER "journal_user_hidden_carousel_images_update";
DROP TRIGGER "journal_user_hidden_carousel_images_delete";
DROP TRIGGER "journal_user_tasks_insert";
DROP TRIGGER "journal_user_tasks_update";
DROP TRIGGER "journal_user_tasks_delete";
ALTER TABLE portal_tenants RENAME TO group_sites;
ALTER TABLE organization_memberships RENAME COLUMN onboarding_tenant_id TO onboarding_group_site_id;
ALTER TABLE availability_polls RENAME COLUMN tenant_id TO group_site_id;
ALTER TABLE user_tasks RENAME COLUMN tenant_id TO group_site_id;
ALTER TABLE user_hidden_carousel_images RENAME COLUMN tenant_id TO group_site_id;
ALTER TABLE onboarding_enrollments RENAME COLUMN tenant_id TO group_site_id;
ALTER TABLE photo_annotations RENAME COLUMN tenant_id TO group_site_id;
ALTER TABLE member_meeting_preferences RENAME COLUMN tenant_id TO group_site_id;
ALTER TABLE member_meetings RENAME COLUMN tenant_id TO group_site_id;
CREATE TRIGGER organization_chat_member_added AFTER INSERT ON organization_memberships
BEGIN
  INSERT INTO organization_chat_provisioning (organization_id) VALUES (NEW.organization_id)
  ON CONFLICT(organization_id) DO UPDATE SET completed_at = NULL, generation = generation + 1;
END;
CREATE TRIGGER organization_chat_member_changed AFTER UPDATE OF role, status, user_name ON organization_memberships
BEGIN
  INSERT INTO organization_chat_provisioning (organization_id) VALUES (NEW.organization_id)
  ON CONFLICT(organization_id) DO UPDATE SET completed_at = NULL, generation = generation + 1;
END;
CREATE TRIGGER organization_status_added AFTER INSERT ON organization_memberships
BEGIN
  INSERT INTO organization_status_notifications (id,user_id,organization_id,organization_name,organization_slug,role,status,email_status,push_status)
  VALUES (lower(hex(randomblob(16))),NEW.user_id,NEW.organization_id,
    COALESCE((SELECT name FROM organizations WHERE id=NEW.organization_id),NEW.organization_id),
    COALESCE((SELECT slug FROM organizations WHERE id=NEW.organization_id),''),NEW.role,NEW.status,
    CASE WHEN COALESCE((SELECT organization_status_email FROM notification_preferences WHERE user_id=NEW.user_id),1)=1 THEN 'queued' ELSE 'skipped' END,
    CASE WHEN COALESCE((SELECT push_enabled*organization_status_push FROM notification_preferences WHERE user_id=NEW.user_id),1)=1 THEN 'queued' ELSE 'skipped' END);
END;
CREATE TRIGGER organization_status_changed AFTER UPDATE OF role,status ON organization_memberships
WHEN OLD.role IS NOT NEW.role OR OLD.status IS NOT NEW.status
BEGIN
  INSERT INTO organization_status_notifications (id,user_id,organization_id,organization_name,organization_slug,previous_role,previous_status,role,status,email_status,push_status)
  VALUES (lower(hex(randomblob(16))),NEW.user_id,NEW.organization_id,
    COALESCE((SELECT name FROM organizations WHERE id=NEW.organization_id),NEW.organization_id),
    COALESCE((SELECT slug FROM organizations WHERE id=NEW.organization_id),''),OLD.role,OLD.status,NEW.role,NEW.status,
    CASE WHEN COALESCE((SELECT organization_status_email FROM notification_preferences WHERE user_id=NEW.user_id),1)=1 THEN 'queued' ELSE 'skipped' END,
    CASE WHEN COALESCE((SELECT push_enabled*organization_status_push FROM notification_preferences WHERE user_id=NEW.user_id),1)=1 THEN 'queued' ELSE 'skipped' END);
END;
CREATE TRIGGER organization_status_removed BEFORE DELETE ON organization_memberships
BEGIN
  INSERT INTO organization_status_notifications (id,user_id,organization_id,organization_name,organization_slug,previous_role,previous_status,email_status,push_status)
  VALUES (lower(hex(randomblob(16))),OLD.user_id,OLD.organization_id,
    COALESCE((SELECT name FROM organizations WHERE id=OLD.organization_id),OLD.organization_id),
    COALESCE((SELECT slug FROM organizations WHERE id=OLD.organization_id),''),OLD.role,OLD.status,
    CASE WHEN COALESCE((SELECT organization_status_email FROM notification_preferences WHERE user_id=OLD.user_id),1)=1 THEN 'queued' ELSE 'skipped' END,
    CASE WHEN COALESCE((SELECT push_enabled*organization_status_push FROM notification_preferences WHERE user_id=OLD.user_id),1)=1 THEN 'queued' ELSE 'skipped' END);
END;
CREATE TRIGGER "journal_availability_polls_insert" AFTER INSERT ON "availability_polls"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('availability_polls',json_object('id',NEW."id"),'insert',NULL,json_object('id',NEW."id",'group_site_id',NEW."group_site_id",'owner_user_id',NEW."owner_user_id",'title',NEW."title",'timezone',NEW."timezone",'slots_json',NEW."slots_json",'closed',NEW."closed",'created_at',NEW."created_at")); END;
CREATE TRIGGER "journal_availability_polls_update" AFTER UPDATE ON "availability_polls"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."id" IS NEW."id" AND OLD."group_site_id" IS NEW."group_site_id" AND OLD."owner_user_id" IS NEW."owner_user_id" AND OLD."title" IS NEW."title" AND OLD."timezone" IS NEW."timezone" AND OLD."slots_json" IS NEW."slots_json" AND OLD."closed" IS NEW."closed" AND OLD."created_at" IS NEW."created_at")
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('availability_polls',json_object('id',NEW."id"),'update',json_object('id',OLD."id",'group_site_id',OLD."group_site_id",'owner_user_id',OLD."owner_user_id",'title',OLD."title",'timezone',OLD."timezone",'slots_json',OLD."slots_json",'closed',OLD."closed",'created_at',OLD."created_at"),json_object('id',NEW."id",'group_site_id',NEW."group_site_id",'owner_user_id',NEW."owner_user_id",'title',NEW."title",'timezone',NEW."timezone",'slots_json',NEW."slots_json",'closed',NEW."closed",'created_at',NEW."created_at")); END;
CREATE TRIGGER "journal_availability_polls_delete" AFTER DELETE ON "availability_polls"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('availability_polls',json_object('id',OLD."id"),'delete',json_object('id',OLD."id",'group_site_id',OLD."group_site_id",'owner_user_id',OLD."owner_user_id",'title',OLD."title",'timezone',OLD."timezone",'slots_json',OLD."slots_json",'closed',OLD."closed",'created_at',OLD."created_at"),NULL); END;
CREATE TRIGGER "journal_member_meeting_preferences_insert" AFTER INSERT ON "member_meeting_preferences"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('member_meeting_preferences',json_object('group_site_id',NEW."group_site_id",'user_id',NEW."user_id"),'insert',NULL,json_object('group_site_id',NEW."group_site_id",'user_id',NEW."user_id",'enabled',NEW."enabled",'timezone',NEW."timezone")); END;
CREATE TRIGGER "journal_member_meeting_preferences_update" AFTER UPDATE ON "member_meeting_preferences"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."group_site_id" IS NEW."group_site_id" AND OLD."user_id" IS NEW."user_id" AND OLD."enabled" IS NEW."enabled" AND OLD."timezone" IS NEW."timezone")
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('member_meeting_preferences',json_object('group_site_id',NEW."group_site_id",'user_id',NEW."user_id"),'update',json_object('group_site_id',OLD."group_site_id",'user_id',OLD."user_id",'enabled',OLD."enabled",'timezone',OLD."timezone"),json_object('group_site_id',NEW."group_site_id",'user_id',NEW."user_id",'enabled',NEW."enabled",'timezone',NEW."timezone")); END;
CREATE TRIGGER "journal_member_meeting_preferences_delete" AFTER DELETE ON "member_meeting_preferences"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('member_meeting_preferences',json_object('group_site_id',OLD."group_site_id",'user_id',OLD."user_id"),'delete',json_object('group_site_id',OLD."group_site_id",'user_id',OLD."user_id",'enabled',OLD."enabled",'timezone',OLD."timezone"),NULL); END;
CREATE TRIGGER "journal_member_meetings_insert" AFTER INSERT ON "member_meetings"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('member_meetings',json_object('id',NEW."id"),'insert',NULL,json_object('id',NEW."id",'group_site_id',NEW."group_site_id",'host_user_id',NEW."host_user_id",'guest_user_id',NEW."guest_user_id",'starts_at',NEW."starts_at",'ends_at',NEW."ends_at",'status',NEW."status",'created_at',NEW."created_at")); END;
CREATE TRIGGER "journal_member_meetings_update" AFTER UPDATE ON "member_meetings"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."id" IS NEW."id" AND OLD."group_site_id" IS NEW."group_site_id" AND OLD."host_user_id" IS NEW."host_user_id" AND OLD."guest_user_id" IS NEW."guest_user_id" AND OLD."starts_at" IS NEW."starts_at" AND OLD."ends_at" IS NEW."ends_at" AND OLD."status" IS NEW."status" AND OLD."created_at" IS NEW."created_at")
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('member_meetings',json_object('id',NEW."id"),'update',json_object('id',OLD."id",'group_site_id',OLD."group_site_id",'host_user_id',OLD."host_user_id",'guest_user_id',OLD."guest_user_id",'starts_at',OLD."starts_at",'ends_at',OLD."ends_at",'status',OLD."status",'created_at',OLD."created_at"),json_object('id',NEW."id",'group_site_id',NEW."group_site_id",'host_user_id',NEW."host_user_id",'guest_user_id',NEW."guest_user_id",'starts_at',NEW."starts_at",'ends_at',NEW."ends_at",'status',NEW."status",'created_at',NEW."created_at")); END;
CREATE TRIGGER "journal_member_meetings_delete" AFTER DELETE ON "member_meetings"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('member_meetings',json_object('id',OLD."id"),'delete',json_object('id',OLD."id",'group_site_id',OLD."group_site_id",'host_user_id',OLD."host_user_id",'guest_user_id',OLD."guest_user_id",'starts_at',OLD."starts_at",'ends_at',OLD."ends_at",'status',OLD."status",'created_at',OLD."created_at"),NULL); END;
CREATE TRIGGER "journal_onboarding_enrollments_insert" AFTER INSERT ON "onboarding_enrollments"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('onboarding_enrollments',json_object('group_site_id',NEW."group_site_id",'user_id',NEW."user_id"),'insert',NULL,json_object('group_site_id',NEW."group_site_id",'user_id',NEW."user_id",'start_date',NEW."start_date",'end_date',NEW."end_date",'acknowledgements',NEW."acknowledgements",'availability_saved_at',NEW."availability_saved_at",'completed_at',NEW."completed_at",'created_at',NEW."created_at")); END;
CREATE TRIGGER "journal_onboarding_enrollments_update" AFTER UPDATE ON "onboarding_enrollments"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."group_site_id" IS NEW."group_site_id" AND OLD."user_id" IS NEW."user_id" AND OLD."start_date" IS NEW."start_date" AND OLD."end_date" IS NEW."end_date" AND OLD."acknowledgements" IS NEW."acknowledgements" AND OLD."availability_saved_at" IS NEW."availability_saved_at" AND OLD."completed_at" IS NEW."completed_at" AND OLD."created_at" IS NEW."created_at")
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('onboarding_enrollments',json_object('group_site_id',NEW."group_site_id",'user_id',NEW."user_id"),'update',json_object('group_site_id',OLD."group_site_id",'user_id',OLD."user_id",'start_date',OLD."start_date",'end_date',OLD."end_date",'acknowledgements',OLD."acknowledgements",'availability_saved_at',OLD."availability_saved_at",'completed_at',OLD."completed_at",'created_at',OLD."created_at"),json_object('group_site_id',NEW."group_site_id",'user_id',NEW."user_id",'start_date',NEW."start_date",'end_date',NEW."end_date",'acknowledgements',NEW."acknowledgements",'availability_saved_at',NEW."availability_saved_at",'completed_at',NEW."completed_at",'created_at',NEW."created_at")); END;
CREATE TRIGGER "journal_onboarding_enrollments_delete" AFTER DELETE ON "onboarding_enrollments"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('onboarding_enrollments',json_object('group_site_id',OLD."group_site_id",'user_id',OLD."user_id"),'delete',json_object('group_site_id',OLD."group_site_id",'user_id',OLD."user_id",'start_date',OLD."start_date",'end_date',OLD."end_date",'acknowledgements',OLD."acknowledgements",'availability_saved_at',OLD."availability_saved_at",'completed_at',OLD."completed_at",'created_at',OLD."created_at"),NULL); END;
CREATE TRIGGER "journal_organization_memberships_insert" AFTER INSERT ON "organization_memberships"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('organization_memberships',json_object('organization_id',NEW."organization_id",'user_id',NEW."user_id"),'insert',NULL,json_object('organization_id',NEW."organization_id",'user_id',NEW."user_id",'user_name',NEW."user_name",'user_email',NEW."user_email",'role',NEW."role",'status',NEW."status",'created_at',NEW."created_at",'updated_at',NEW."updated_at",'pending_organizer',NEW."pending_organizer",'onboarding_group_site_id',NEW."onboarding_group_site_id")); END;
CREATE TRIGGER "journal_organization_memberships_update" AFTER UPDATE ON "organization_memberships"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."organization_id" IS NEW."organization_id" AND OLD."user_id" IS NEW."user_id" AND OLD."user_name" IS NEW."user_name" AND OLD."user_email" IS NEW."user_email" AND OLD."role" IS NEW."role" AND OLD."status" IS NEW."status" AND OLD."created_at" IS NEW."created_at" AND OLD."updated_at" IS NEW."updated_at" AND OLD."pending_organizer" IS NEW."pending_organizer" AND OLD."onboarding_group_site_id" IS NEW."onboarding_group_site_id")
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('organization_memberships',json_object('organization_id',NEW."organization_id",'user_id',NEW."user_id"),'update',json_object('organization_id',OLD."organization_id",'user_id',OLD."user_id",'user_name',OLD."user_name",'user_email',OLD."user_email",'role',OLD."role",'status',OLD."status",'created_at',OLD."created_at",'updated_at',OLD."updated_at",'pending_organizer',OLD."pending_organizer",'onboarding_group_site_id',OLD."onboarding_group_site_id"),json_object('organization_id',NEW."organization_id",'user_id',NEW."user_id",'user_name',NEW."user_name",'user_email',NEW."user_email",'role',NEW."role",'status',NEW."status",'created_at',NEW."created_at",'updated_at',NEW."updated_at",'pending_organizer',NEW."pending_organizer",'onboarding_group_site_id',NEW."onboarding_group_site_id")); END;
CREATE TRIGGER "journal_organization_memberships_delete" AFTER DELETE ON "organization_memberships"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('organization_memberships',json_object('organization_id',OLD."organization_id",'user_id',OLD."user_id"),'delete',json_object('organization_id',OLD."organization_id",'user_id',OLD."user_id",'user_name',OLD."user_name",'user_email',OLD."user_email",'role',OLD."role",'status',OLD."status",'created_at',OLD."created_at",'updated_at',OLD."updated_at",'pending_organizer',OLD."pending_organizer",'onboarding_group_site_id',OLD."onboarding_group_site_id"),NULL); END;
CREATE TRIGGER "journal_photo_annotations_insert" AFTER INSERT ON "photo_annotations"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('photo_annotations',json_object('group_site_id',NEW."group_site_id",'source',NEW."source",'owner_id',NEW."owner_id",'photo_id',NEW."photo_id"),'insert',NULL,json_object('group_site_id',NEW."group_site_id",'source',NEW."source",'owner_id',NEW."owner_id",'photo_id',NEW."photo_id",'tags_json',NEW."tags_json",'version',NEW."version",'updated_by_user_id',NEW."updated_by_user_id",'updated_at',NEW."updated_at")); END;
CREATE TRIGGER "journal_photo_annotations_update" AFTER UPDATE ON "photo_annotations"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."group_site_id" IS NEW."group_site_id" AND OLD."source" IS NEW."source" AND OLD."owner_id" IS NEW."owner_id" AND OLD."photo_id" IS NEW."photo_id" AND OLD."tags_json" IS NEW."tags_json" AND OLD."version" IS NEW."version" AND OLD."updated_by_user_id" IS NEW."updated_by_user_id" AND OLD."updated_at" IS NEW."updated_at")
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('photo_annotations',json_object('group_site_id',NEW."group_site_id",'source',NEW."source",'owner_id',NEW."owner_id",'photo_id',NEW."photo_id"),'update',json_object('group_site_id',OLD."group_site_id",'source',OLD."source",'owner_id',OLD."owner_id",'photo_id',OLD."photo_id",'tags_json',OLD."tags_json",'version',OLD."version",'updated_by_user_id',OLD."updated_by_user_id",'updated_at',OLD."updated_at"),json_object('group_site_id',NEW."group_site_id",'source',NEW."source",'owner_id',NEW."owner_id",'photo_id',NEW."photo_id",'tags_json',NEW."tags_json",'version',NEW."version",'updated_by_user_id',NEW."updated_by_user_id",'updated_at',NEW."updated_at")); END;
CREATE TRIGGER "journal_photo_annotations_delete" AFTER DELETE ON "photo_annotations"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('photo_annotations',json_object('group_site_id',OLD."group_site_id",'source',OLD."source",'owner_id',OLD."owner_id",'photo_id',OLD."photo_id"),'delete',json_object('group_site_id',OLD."group_site_id",'source',OLD."source",'owner_id',OLD."owner_id",'photo_id',OLD."photo_id",'tags_json',OLD."tags_json",'version',OLD."version",'updated_by_user_id',OLD."updated_by_user_id",'updated_at',OLD."updated_at"),NULL); END;
CREATE TRIGGER "journal_group_sites_insert" AFTER INSERT ON "group_sites"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('group_sites',json_object('id',NEW."id"),'insert',NULL,json_object('id',NEW."id",'hostname',NEW."hostname",'name',NEW."name",'tagline',NEW."tagline",'accent_color',NEW."accent_color",'profile',NEW."profile",'features',NEW."features",'created_at',NEW."created_at",'updated_at',NEW."updated_at",'brand_image_path',NEW."brand_image_path",'home_url',NEW."home_url",'member_home_path',NEW."member_home_path",'manifest_path',NEW."manifest_path",'theme_color',NEW."theme_color",'home_kind',NEW."home_kind",'home_path',NEW."home_path",'home_org_slug',NEW."home_org_slug",'home_heading',NEW."home_heading",'home_description',NEW."home_description",'home_primary_label',NEW."home_primary_label",'home_primary_href',NEW."home_primary_href",'home_secondary_label',NEW."home_secondary_label",'home_secondary_href',NEW."home_secondary_href",'home_image_url',NEW."home_image_url",'public_base_url',NEW."public_base_url",'canonical_path_prefix',NEW."canonical_path_prefix",'feature_config',NEW."feature_config",'organization_id',NEW."organization_id",'slug',NEW."slug",'custom_domain_hostname',NEW."custom_domain_hostname",'custom_domain_status',NEW."custom_domain_status",'custom_domain_requested_at',NEW."custom_domain_requested_at",'custom_domain_attached_at',NEW."custom_domain_attached_at",'custom_domain_notes',NEW."custom_domain_notes")); END;
CREATE TRIGGER "journal_group_sites_update" AFTER UPDATE ON "group_sites"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."id" IS NEW."id" AND OLD."hostname" IS NEW."hostname" AND OLD."name" IS NEW."name" AND OLD."tagline" IS NEW."tagline" AND OLD."accent_color" IS NEW."accent_color" AND OLD."profile" IS NEW."profile" AND OLD."features" IS NEW."features" AND OLD."created_at" IS NEW."created_at" AND OLD."updated_at" IS NEW."updated_at" AND OLD."brand_image_path" IS NEW."brand_image_path" AND OLD."home_url" IS NEW."home_url" AND OLD."member_home_path" IS NEW."member_home_path" AND OLD."manifest_path" IS NEW."manifest_path" AND OLD."theme_color" IS NEW."theme_color" AND OLD."home_kind" IS NEW."home_kind" AND OLD."home_path" IS NEW."home_path" AND OLD."home_org_slug" IS NEW."home_org_slug" AND OLD."home_heading" IS NEW."home_heading" AND OLD."home_description" IS NEW."home_description" AND OLD."home_primary_label" IS NEW."home_primary_label" AND OLD."home_primary_href" IS NEW."home_primary_href" AND OLD."home_secondary_label" IS NEW."home_secondary_label" AND OLD."home_secondary_href" IS NEW."home_secondary_href" AND OLD."home_image_url" IS NEW."home_image_url" AND OLD."public_base_url" IS NEW."public_base_url" AND OLD."canonical_path_prefix" IS NEW."canonical_path_prefix" AND OLD."feature_config" IS NEW."feature_config" AND OLD."organization_id" IS NEW."organization_id" AND OLD."slug" IS NEW."slug" AND OLD."custom_domain_hostname" IS NEW."custom_domain_hostname" AND OLD."custom_domain_status" IS NEW."custom_domain_status" AND OLD."custom_domain_requested_at" IS NEW."custom_domain_requested_at" AND OLD."custom_domain_attached_at" IS NEW."custom_domain_attached_at" AND OLD."custom_domain_notes" IS NEW."custom_domain_notes")
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('group_sites',json_object('id',NEW."id"),'update',json_object('id',OLD."id",'hostname',OLD."hostname",'name',OLD."name",'tagline',OLD."tagline",'accent_color',OLD."accent_color",'profile',OLD."profile",'features',OLD."features",'created_at',OLD."created_at",'updated_at',OLD."updated_at",'brand_image_path',OLD."brand_image_path",'home_url',OLD."home_url",'member_home_path',OLD."member_home_path",'manifest_path',OLD."manifest_path",'theme_color',OLD."theme_color",'home_kind',OLD."home_kind",'home_path',OLD."home_path",'home_org_slug',OLD."home_org_slug",'home_heading',OLD."home_heading",'home_description',OLD."home_description",'home_primary_label',OLD."home_primary_label",'home_primary_href',OLD."home_primary_href",'home_secondary_label',OLD."home_secondary_label",'home_secondary_href',OLD."home_secondary_href",'home_image_url',OLD."home_image_url",'public_base_url',OLD."public_base_url",'canonical_path_prefix',OLD."canonical_path_prefix",'feature_config',OLD."feature_config",'organization_id',OLD."organization_id",'slug',OLD."slug",'custom_domain_hostname',OLD."custom_domain_hostname",'custom_domain_status',OLD."custom_domain_status",'custom_domain_requested_at',OLD."custom_domain_requested_at",'custom_domain_attached_at',OLD."custom_domain_attached_at",'custom_domain_notes',OLD."custom_domain_notes"),json_object('id',NEW."id",'hostname',NEW."hostname",'name',NEW."name",'tagline',NEW."tagline",'accent_color',NEW."accent_color",'profile',NEW."profile",'features',NEW."features",'created_at',NEW."created_at",'updated_at',NEW."updated_at",'brand_image_path',NEW."brand_image_path",'home_url',NEW."home_url",'member_home_path',NEW."member_home_path",'manifest_path',NEW."manifest_path",'theme_color',NEW."theme_color",'home_kind',NEW."home_kind",'home_path',NEW."home_path",'home_org_slug',NEW."home_org_slug",'home_heading',NEW."home_heading",'home_description',NEW."home_description",'home_primary_label',NEW."home_primary_label",'home_primary_href',NEW."home_primary_href",'home_secondary_label',NEW."home_secondary_label",'home_secondary_href',NEW."home_secondary_href",'home_image_url',NEW."home_image_url",'public_base_url',NEW."public_base_url",'canonical_path_prefix',NEW."canonical_path_prefix",'feature_config',NEW."feature_config",'organization_id',NEW."organization_id",'slug',NEW."slug",'custom_domain_hostname',NEW."custom_domain_hostname",'custom_domain_status',NEW."custom_domain_status",'custom_domain_requested_at',NEW."custom_domain_requested_at",'custom_domain_attached_at',NEW."custom_domain_attached_at",'custom_domain_notes',NEW."custom_domain_notes")); END;
CREATE TRIGGER "journal_group_sites_delete" AFTER DELETE ON "group_sites"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('group_sites',json_object('id',OLD."id"),'delete',json_object('id',OLD."id",'hostname',OLD."hostname",'name',OLD."name",'tagline',OLD."tagline",'accent_color',OLD."accent_color",'profile',OLD."profile",'features',OLD."features",'created_at',OLD."created_at",'updated_at',OLD."updated_at",'brand_image_path',OLD."brand_image_path",'home_url',OLD."home_url",'member_home_path',OLD."member_home_path",'manifest_path',OLD."manifest_path",'theme_color',OLD."theme_color",'home_kind',OLD."home_kind",'home_path',OLD."home_path",'home_org_slug',OLD."home_org_slug",'home_heading',OLD."home_heading",'home_description',OLD."home_description",'home_primary_label',OLD."home_primary_label",'home_primary_href',OLD."home_primary_href",'home_secondary_label',OLD."home_secondary_label",'home_secondary_href',OLD."home_secondary_href",'home_image_url',OLD."home_image_url",'public_base_url',OLD."public_base_url",'canonical_path_prefix',OLD."canonical_path_prefix",'feature_config',OLD."feature_config",'organization_id',OLD."organization_id",'slug',OLD."slug",'custom_domain_hostname',OLD."custom_domain_hostname",'custom_domain_status',OLD."custom_domain_status",'custom_domain_requested_at',OLD."custom_domain_requested_at",'custom_domain_attached_at',OLD."custom_domain_attached_at",'custom_domain_notes',OLD."custom_domain_notes"),NULL); END;
CREATE TRIGGER "journal_user_hidden_carousel_images_insert" AFTER INSERT ON "user_hidden_carousel_images"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('user_hidden_carousel_images',json_object('group_site_id',NEW."group_site_id",'user_id',NEW."user_id",'carousel_id',NEW."carousel_id",'file_id',NEW."file_id"),'insert',NULL,json_object('group_site_id',NEW."group_site_id",'user_id',NEW."user_id",'carousel_id',NEW."carousel_id",'file_id',NEW."file_id",'hidden_at',NEW."hidden_at")); END;
CREATE TRIGGER "journal_user_hidden_carousel_images_update" AFTER UPDATE ON "user_hidden_carousel_images"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."group_site_id" IS NEW."group_site_id" AND OLD."user_id" IS NEW."user_id" AND OLD."carousel_id" IS NEW."carousel_id" AND OLD."file_id" IS NEW."file_id" AND OLD."hidden_at" IS NEW."hidden_at")
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('user_hidden_carousel_images',json_object('group_site_id',NEW."group_site_id",'user_id',NEW."user_id",'carousel_id',NEW."carousel_id",'file_id',NEW."file_id"),'update',json_object('group_site_id',OLD."group_site_id",'user_id',OLD."user_id",'carousel_id',OLD."carousel_id",'file_id',OLD."file_id",'hidden_at',OLD."hidden_at"),json_object('group_site_id',NEW."group_site_id",'user_id',NEW."user_id",'carousel_id',NEW."carousel_id",'file_id',NEW."file_id",'hidden_at',NEW."hidden_at")); END;
CREATE TRIGGER "journal_user_hidden_carousel_images_delete" AFTER DELETE ON "user_hidden_carousel_images"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('user_hidden_carousel_images',json_object('group_site_id',OLD."group_site_id",'user_id',OLD."user_id",'carousel_id',OLD."carousel_id",'file_id',OLD."file_id"),'delete',json_object('group_site_id',OLD."group_site_id",'user_id',OLD."user_id",'carousel_id',OLD."carousel_id",'file_id',OLD."file_id",'hidden_at',OLD."hidden_at"),NULL); END;
CREATE TRIGGER "journal_user_tasks_insert" AFTER INSERT ON "user_tasks"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('user_tasks',json_object('id',NEW."id"),'insert',NULL,json_object('id',NEW."id",'group_site_id',NEW."group_site_id",'user_id',NEW."user_id",'created_by_user_id',NEW."created_by_user_id",'kind',NEW."kind",'entity_id',NEW."entity_id",'title',NEW."title",'status',NEW."status",'created_at',NEW."created_at",'completed_at',NEW."completed_at")); END;
CREATE TRIGGER "journal_user_tasks_update" AFTER UPDATE ON "user_tasks"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."id" IS NEW."id" AND OLD."group_site_id" IS NEW."group_site_id" AND OLD."user_id" IS NEW."user_id" AND OLD."created_by_user_id" IS NEW."created_by_user_id" AND OLD."kind" IS NEW."kind" AND OLD."entity_id" IS NEW."entity_id" AND OLD."title" IS NEW."title" AND OLD."status" IS NEW."status" AND OLD."created_at" IS NEW."created_at" AND OLD."completed_at" IS NEW."completed_at")
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('user_tasks',json_object('id',NEW."id"),'update',json_object('id',OLD."id",'group_site_id',OLD."group_site_id",'user_id',OLD."user_id",'created_by_user_id',OLD."created_by_user_id",'kind',OLD."kind",'entity_id',OLD."entity_id",'title',OLD."title",'status',OLD."status",'created_at',OLD."created_at",'completed_at',OLD."completed_at"),json_object('id',NEW."id",'group_site_id',NEW."group_site_id",'user_id',NEW."user_id",'created_by_user_id',NEW."created_by_user_id",'kind',NEW."kind",'entity_id',NEW."entity_id",'title',NEW."title",'status',NEW."status",'created_at',NEW."created_at",'completed_at',NEW."completed_at")); END;
CREATE TRIGGER "journal_user_tasks_delete" AFTER DELETE ON "user_tasks"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('user_tasks',json_object('id',OLD."id"),'delete',json_object('id',OLD."id",'group_site_id',OLD."group_site_id",'user_id',OLD."user_id",'created_by_user_id',OLD."created_by_user_id",'kind',OLD."kind",'entity_id',OLD."entity_id",'title',OLD."title",'status',OLD."status",'created_at',OLD."created_at",'completed_at',OLD."completed_at"),NULL); END;
UPDATE change_journal_coverage SET table_name='group_sites' WHERE table_name='portal_tenants';
UPDATE change_journal_coverage SET columns_json=replace(replace(columns_json,'onboarding_tenant_id','onboarding_group_site_id'),'tenant_id','group_site_id') WHERE instr(columns_json,'tenant_id')>0;
DROP INDEX "idx_portal_tenants_slug";
CREATE UNIQUE INDEX idx_group_sites_slug
ON "group_sites"(slug)
WHERE slug IS NOT NULL;
DROP INDEX "idx_portal_tenants_organization";
CREATE INDEX idx_group_sites_organization
ON "group_sites"(organization_id)
WHERE organization_id IS NOT NULL;
DROP INDEX "idx_portal_tenants_custom_domain";
CREATE INDEX idx_group_sites_custom_domain
ON "group_sites"(custom_domain_hostname)
WHERE custom_domain_hostname IS NOT NULL;
