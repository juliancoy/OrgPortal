-- Review before applying. Organization metadata is the only writable source.
ALTER TABLE organizations ADD COLUMN links_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(links_json) AND json_type(links_json)='array');

-- Extend the existing journal; edits, clearing and deletion stay auditable.
UPDATE change_journal_coverage SET columns_json = json_insert(columns_json, '$[#]', 'links_json') WHERE table_name = 'organizations';
DROP TRIGGER "journal_organizations_insert";
CREATE TRIGGER "journal_organizations_insert" AFTER INSERT ON "organizations"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('organizations',json_object('id',NEW."id"),'insert',NULL,json_object('id',NEW."id",'name',NEW."name",'slug',NEW."slug",'description',NEW."description",'source_url',NEW."source_url",'image_url',NEW."image_url",'tags',NEW."tags",'city',NEW."city",'created_at',NEW."created_at",'updated_at',NEW."updated_at",'media_json',NEW."media_json",'links_json',NEW."links_json")); END;
DROP TRIGGER "journal_organizations_update";
CREATE TRIGGER "journal_organizations_update" AFTER UPDATE ON "organizations"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL) AND NOT(OLD."id" IS NEW."id" AND OLD."name" IS NEW."name" AND OLD."slug" IS NEW."slug" AND OLD."description" IS NEW."description" AND OLD."source_url" IS NEW."source_url" AND OLD."image_url" IS NEW."image_url" AND OLD."tags" IS NEW."tags" AND OLD."city" IS NEW."city" AND OLD."created_at" IS NEW."created_at" AND OLD."updated_at" IS NEW."updated_at" AND OLD."media_json" IS NEW."media_json" AND OLD."links_json" IS NEW."links_json")
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('organizations',json_object('id',NEW."id"),'update',json_object('id',OLD."id",'name',OLD."name",'slug',OLD."slug",'description',OLD."description",'source_url',OLD."source_url",'image_url',OLD."image_url",'tags',OLD."tags",'city',OLD."city",'created_at',OLD."created_at",'updated_at',OLD."updated_at",'media_json',OLD."media_json",'links_json',OLD."links_json"),json_object('id',NEW."id",'name',NEW."name",'slug',NEW."slug",'description',NEW."description",'source_url',NEW."source_url",'image_url',NEW."image_url",'tags',NEW."tags",'city',NEW."city",'created_at',NEW."created_at",'updated_at',NEW."updated_at",'media_json',NEW."media_json",'links_json',NEW."links_json")); END;
DROP TRIGGER "journal_organizations_delete";
CREATE TRIGGER "journal_organizations_delete" AFTER DELETE ON "organizations"
WHEN NOT EXISTS(SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL)
BEGIN INSERT INTO change_journal(table_name,record_key,operation,before_json,after_json)
 VALUES('organizations',json_object('id',OLD."id"),'delete',json_object('id',OLD."id",'name',OLD."name",'slug',OLD."slug",'description',OLD."description",'source_url',OLD."source_url",'image_url',OLD."image_url",'tags',OLD."tags",'city',OLD."city",'created_at',OLD."created_at",'updated_at',OLD."updated_at",'media_json',OLD."media_json",'links_json',OLD."links_json"),NULL); END;


-- Move portal social configuration into typed organization links once.
UPDATE organizations SET links_json = COALESCE((
  SELECT (SELECT json_group_array(json_object('id',type,'type',type,'url',url)) FROM (
    SELECT 'whatsapp' AS type,json_extract(t.feature_config,'$.whatsappUrl') AS url UNION ALL
    SELECT 'luma',json_extract(t.feature_config,'$.lumaUrl') UNION ALL
    SELECT 'eventbrite',json_extract(t.feature_config,'$.eventbriteUrl') UNION ALL
    SELECT 'github',json_extract(t.feature_config,'$.githubUrl') UNION ALL
    SELECT 'website',json_extract(t.feature_config,'$.websiteUrl') UNION ALL
    SELECT 'linkedin',json_extract(t.feature_config,'$.linkedinUrl') UNION ALL
    SELECT 'instagram',json_extract(t.feature_config,'$.instagramUrl') UNION ALL
    SELECT 'facebook',json_extract(t.feature_config,'$.facebookUrl') UNION ALL
    SELECT 'discord',json_extract(t.feature_config,'$.discordUrl') UNION ALL
    SELECT 'telegram',json_extract(t.feature_config,'$.telegramUrl') UNION ALL
    SELECT 'youtube',json_extract(t.feature_config,'$.youtubeUrl')
  ) WHERE url LIKE 'https://%' AND url NOT LIKE '%@%')
  FROM group_sites t
  WHERE t.organization_id = organizations.id OR (t.organization_id IS NULL AND t.home_org_slug = organizations.slug)
  ORDER BY t.organization_id IS NULL,t.id LIMIT 1
), '[]');

-- Preserve former social-dock defaults only for explicitly associated MedTech orgs.
UPDATE organizations SET links_json=json_insert(links_json,'$[#]',json_object('id','whatsapp','type','whatsapp','url','https://chat.whatsapp.com/D52d1XHKZQCFZyFfFq0KIR')) WHERE NOT EXISTS (SELECT 1 FROM json_each(organizations.links_json) WHERE json_extract(value,'$.type')='whatsapp') AND EXISTS (SELECT 1 FROM group_sites t WHERE (t.id='baltimore-medtech' OR t.profile='baltimore-medtech') AND (t.organization_id=organizations.id OR (t.organization_id IS NULL AND t.home_org_slug=organizations.slug)));
UPDATE organizations SET links_json=json_insert(links_json,'$[#]',json_object('id','github','type','github','url','https://github.com/juliancoy/BmoreMedTech')) WHERE NOT EXISTS (SELECT 1 FROM json_each(organizations.links_json) WHERE json_extract(value,'$.type')='github') AND EXISTS (SELECT 1 FROM group_sites t WHERE (t.id='baltimore-medtech' OR t.profile='baltimore-medtech') AND (t.organization_id=organizations.id OR (t.organization_id IS NULL AND t.home_org_slug=organizations.slug)));
UPDATE organizations SET links_json=json_insert(links_json,'$[#]',json_object('id','luma','type','luma','url','https://luma.com/')) WHERE NOT EXISTS (SELECT 1 FROM json_each(organizations.links_json) WHERE json_extract(value,'$.type')='luma') AND EXISTS (SELECT 1 FROM group_sites t WHERE (t.id='baltimore-medtech' OR t.profile='baltimore-medtech') AND (t.organization_id=organizations.id OR (t.organization_id IS NULL AND t.home_org_slug=organizations.slug)));

UPDATE group_sites SET feature_config=json_remove(feature_config,'$.whatsappUrl','$.lumaUrl','$.eventbriteUrl','$.githubUrl','$.websiteUrl','$.linkedinUrl','$.instagramUrl','$.facebookUrl','$.discordUrl','$.telegramUrl','$.youtubeUrl') WHERE EXISTS (SELECT 1 FROM organizations o WHERE (o.id=group_sites.organization_id OR (group_sites.organization_id IS NULL AND o.slug=group_sites.home_org_slug)) AND json_array_length(o.links_json)>0);
