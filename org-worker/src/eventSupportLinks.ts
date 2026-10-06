import {z} from 'zod';
import {EventIntegrationError} from './eventPlatforms';
const recordIds=z.array(z.string().min(1).max(200)).max(100);
/** Called only from the existing bearer-authenticated calendar ingestion route. */
export async function linkEventSupportRecords(db:D1Database,event:{id:string;title:string;host_org_id:string|null;starts_at:string|null},input:unknown,publicUrl:string) {
 if (input===undefined) return;
 const ids=[...new Set(recordIds.parse(input))];
 if (!ids.length) return;
 if (!event.host_org_id || !event.starts_at) throw new EventIntegrationError(400,'An event host and date are required to link support');
 const statements:D1PreparedStatement[]=[];
 for (const id of ids) {
  const row=await db.prepare("SELECT id,from_organization_id,to_organization_id,occurred_at,provenance_json FROM organization_support_records WHERE id=? AND status!='voided'").bind(id).first<{id:string;from_organization_id:string;to_organization_id:string|null;occurred_at:string;provenance_json:string}>();
  if (!row || row.from_organization_id!==event.host_org_id || row.occurred_at.slice(0,10)!==event.starts_at.slice(0,10)) throw new EventIntegrationError(400,'Support records must match the event host and date');
  const provenance=JSON.parse(row.provenance_json);
  if (!Array.isArray(provenance)) throw new EventIntegrationError(400,'Invalid support provenance');
  const updated=[...provenance.filter(item=>item?.eventId!==event.id),{source:'OrgPortal event',eventId:event.id,eventUrl:publicUrl,eventTitle:event.title}];
  statements.push(db.prepare('UPDATE organization_support_records SET provenance_json=? WHERE id=?').bind(JSON.stringify(updated),id));
  if(row.to_organization_id) statements.push(db.prepare('INSERT OR IGNORE INTO event_organizations(event_id,organization_id) VALUES(?,?)').bind(event.id,row.to_organization_id));
 }
 await db.batch(statements);
}
