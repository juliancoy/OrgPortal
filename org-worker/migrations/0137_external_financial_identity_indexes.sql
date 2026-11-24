-- Reviewed separately from code release: additive, non-unique lookup indexes.
-- Preserve all source data and old-Worker compatibility. Exact names and IDs
-- still both have to match; these indexes do not establish associations.
CREATE INDEX IF NOT EXISTS external_usaspending_recipient_identity
 ON external_financial_observations(recipient_label,json_extract(metadata_json,'$.recipient_uei'))
 WHERE source_system='usaspending';
CREATE INDEX IF NOT EXISTS external_usaspending_agency_identity
 ON external_financial_observations(agency_label,json_extract(metadata_json,'$.awarding_agency_code'))
 WHERE source_system='usaspending';
