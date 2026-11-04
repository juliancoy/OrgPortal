-- A portal-prefixed graph record is the same evidence as its native support ID.
-- Preserve the source snapshot, but project that evidence only once in the master view.
DROP VIEW master_transaction_records;
CREATE VIEW master_transaction_records AS
SELECT * FROM master_transaction_records_before_ecosystem
UNION ALL
SELECT 'ecosystem:' || r.record_key,json_extract(r.payload_json,'$.id'),'ecosystem_relationship',d.activated_at,
 COALESCE(json_extract(r.payload_json,'$.date'),''),COALESCE(json_extract(r.payload_json,'$.kind'),json_extract(r.payload_json,'$.relationship')),
 json_extract(r.payload_json,'$.amount'),json_extract(r.payload_json,'$.currency'),COALESCE(json_extract(r.payload_json,'$.amountLabel'),''),
 json_extract(r.payload_json,'$.quantity'),json_extract(r.payload_json,'$.unit'),
 COALESCE(json_extract(r.payload_json,'$.description'),json_extract(r.payload_json,'$.type'),''),NULL,NULL,
 COALESCE(json_extract(r.payload_json,'$.sourceLabel'),''),COALESCE(json_extract(r.payload_json,'$.targetLabel'),''),
 NULL,NULL,NULL,NULL,COALESCE(json_extract(r.payload_json,'$.status'),'reported'),NULL,
 COALESCE(json_extract(r.payload_json,'$.sourceUrl'),''),COALESCE(json_extract(r.payload_json,'$.evidence'),''),COALESCE(json_extract(r.payload_json,'$.notes'),''),
 COALESCE(json_extract(r.payload_json,'$.provenance'),'{}'),'[]',
 json_extract(r.payload_json,'$.financialFactType'),NULL,json_extract(r.payload_json,'$.financialMeasure'),NULL,NULL,
 json_extract(r.payload_json,'$.periodStart'),json_extract(r.payload_json,'$.periodEnd'),NULL,NULL,NULL,NULL,NULL,
 json_extract(r.payload_json,'$.awardKey'),NULL,NULL,NULL,NULL,NULL
FROM ecosystem_public_records r JOIN ecosystem_public_datasets d ON d.id=r.dataset_id AND d.state='active'
WHERE r.collection='relationships'
 AND NOT EXISTS(SELECT 1 FROM organization_support_records m WHERE m.id IN
 (json_extract(r.payload_json,'$.id'),CASE WHEN json_extract(r.payload_json,'$.id') LIKE 'portal:%' THEN substr(json_extract(r.payload_json,'$.id'),8) END,'bmoremedtech:' || json_extract(r.payload_json,'$.id'),'bmoremedtech:' || json_extract(r.payload_json,'$.financingId')))
 AND NOT EXISTS(SELECT 1 FROM nonprofit_grant_records n WHERE n.id=json_extract(r.payload_json,'$.id'));
