import {EventIntegrationError} from './eventPlatforms';
/** Optional financial-only stores; permissions and one-use previews stay in DB. */
export function federalStores(env:Partial<Pick<FederalStorageBindings,'FEDERAL_0'|'FEDERAL_1'|'FEDERAL_2'|'FEDERAL_3'>>):D1Database[]{
 const stores=[env.FEDERAL_0,env.FEDERAL_1,env.FEDERAL_2,env.FEDERAL_3];
 if(stores.every(value=>!value))return [];
 if(stores.some(value=>!value))throw new EventIntegrationError(503,'Federal storage configuration is incomplete');
 return stores.filter((value):value is D1Database=>!!value);
}
export function federalShard(id:string){
 const match=/^usaspending:transaction:([a-f0-9])[a-f0-9]{63}$/.exec(id);
 if(!match)throw new EventIntegrationError(400,'Invalid federal transaction ID');
 return Math.floor(parseInt(match[1],16)/4);
}
/** Same public fields as the external branch of the master transaction view. */
export const federalPublicProjection=`id,id AS record_id,'external_financial_observation' AS record_type,
 occurred_at,fact_type AS transaction_type,amount_cents/100.0 AS amount,currency,fact_type AS amount_label,
 NULL AS quantity,NULL AS unit,description,agency_label AS from_label,recipient_label AS to_label,
 NULL AS from_organization_id,NULL AS to_organization_id,'reported' AS status,source_url,source_system AS evidence,notes,
 metadata_json AS provenance_json,fact_type AS financial_fact_type,measurement AS financial_measurement,
 NULL AS period_start,NULL AS period_end,id AS award_id,external_id AS award_identifier`;
