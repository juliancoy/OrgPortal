import { z } from 'zod';
import { registrySchema } from './organizationRegistry';
import { supportSchema } from './organizationSupport';
import { authorizeOrganization, type OrganizationActor } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { prepareEventOperation, claimEventOperation, finishEventOperation, previewFingerprint, enforceEventRateLimit } from './eventOperationStore';

export const evidenceImportSchema = z.object({
  organizationId: z.string().min(1).max(200),
  recipients: z.array(registrySchema.omit({ confirm: true, previewId: true }).extend({
    key: z.string().regex(/^[a-z0-9-]{1,100}$/),
    existingOrganizationId: z.string().min(1).max(200).nullable().default(null),
    support: supportSchema.omit({ organizationId: true, recipientOrganizationId: true, confirm: true, previewId: true }),
  }).strict()).min(1).max(25),
  confirm: z.boolean().optional(), previewId: z.string().uuid().optional(),
}).strict();

// Public evidence registration has the same operator boundary as the registry.
// The source organization's management permission and the normal one-use receipt
// are checked at preview AND apply. No feed credential or inferred owner is used.
export async function importOrganizationEvidence(db: D1Database, actor: OrganizationActor, input: unknown) {
  if (!actor.isOperator) throw new EventIntegrationError(403, 'Operator access required for public evidence registration');
  const parsed = evidenceImportSchema.safeParse(input);
  if (!parsed.success) throw new EventIntegrationError(400, 'Invalid public evidence import');
  const { confirm, previewId, ...changes } = parsed.data;
  if (new Set(changes.recipients.map(row => row.key)).size !== changes.recipients.length)
    throw new EventIntegrationError(400, 'Duplicate recipient keys');
  const from = await db.prepare('SELECT id,name,slug FROM organizations WHERE id=? OR slug=?').bind(changes.organizationId, changes.organizationId).first<{id:string;name:string;slug:string}>();
  if (!from) throw new EventIntegrationError(404, 'Supporting organization not found');
  await authorizeOrganization(db, actor, 'manage', from.id);
  await enforceEventRateLimit(db, actor.id);
  const plan = [];
  for (const row of changes.recipients) {
    const { support } = row;
    if ((support.amount === null) !== (support.currency === null) || (support.quantity === null) !== (support.unit === null))
      throw new EventIntegrationError(400, 'Amount/currency and quantity/unit must be paired');
    if (!['transfer','terms','capitalization','portfolio','coinvestment'].includes(support.supportKind) && support.amount !== null)
      throw new EventIntegrationError(400, 'Nonmonetary support cannot have a monetary amount');
    const hash = await previewFingerprint({ from: from.id, key: row.key });
    const id = row.existingOrganizationId || `evidence-${hash}`;
    const existing = await db.prepare('SELECT id,name,slug,tags,updated_at FROM organizations WHERE id=?').bind(id).first<{id:string;name:string;slug:string;tags:string;updated_at:string}>();
    if (row.existingOrganizationId && !existing) throw new EventIntegrationError(409, `Recipient identity needs review: ${row.name}`);
    if (id === from.id) throw new EventIntegrationError(400, 'An organization cannot support itself');
    if (!existing) {
      const duplicate = await db.prepare('SELECT id FROM organizations WHERE lower(name)=lower(?) OR (? IS NOT NULL AND source_url=?) LIMIT 1')
        .bind(row.name,row.website || null,row.website || null).first();
      if (duplicate) throw new EventIntegrationError(409, `Existing recipient needs an explicit identity match: ${row.name}`);
    }
    let tags: string[] = [];
    if (existing) { try { const value=JSON.parse(existing.tags || '[]'); if(Array.isArray(value)) tags=value.filter(item=>typeof item==='string'); } catch {} }
    tags = [...new Set([...tags,...row.tags])];
    const recordId=`support-evidence-${hash}`;
    const record=await db.prepare('SELECT * FROM organization_support_records WHERE id=?').bind(recordId).first<Record<string,unknown>>();
    const recordFields = {from_organization_id:from.id,to_organization_id:id,support_kind:support.supportKind,amount:support.amount,currency:support.currency,
      quantity:support.quantity,unit:support.unit,description:support.description,occurred_at:support.occurredAt,source_url:support.sourceUrl,evidence:support.evidence,notes:support.notes,status:support.status};
    if (record && Object.entries(recordFields).some(([key,value])=>record[key]!==value))
      throw new EventIntegrationError(409, `Imported evidence has changed or was voided; review the existing record: ${row.name}`);
    const slug=existing?.slug || `${row.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,140) || 'organization'}-${hash.slice(0,12)}`;
    plan.push({ row, id, slug, tags, existing, record, recordId, recordFields });
  }
  if (new Set(plan.map(row=>row.id)).size!==plan.length) throw new EventIntegrationError(400, 'Two rows refer to the same recipient organization');
  const preview={ operation:'import_public_evidence', changes, from, plan, effect:'Registers unclaimed public organizations, merges reviewed tags, and records sourced support. No ownership, membership or account balance changes.' };
  const owner={userId:actor.id,organizationId:from.id,eventId:'organization:evidence-import'};
  const fingerprint=await previewFingerprint(preview);
  if (!confirm) return {...preview,...await prepareEventOperation(db,owner,fingerprint)};
  if (!previewId) throw new EventIntegrationError(409,'Request a preview first and supply its previewId');
  await claimEventOperation(db,owner,previewId,fingerprint);
  const now=new Date().toISOString();
  try {
    const statements: D1PreparedStatement[]=[];
    for (const item of plan) {
      const { row,id,slug,tags,recordId }=item;
      if (!item.existing) statements.push(db.prepare(`INSERT INTO organizations(id,name,slug,description,source_url,tags,city,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`)
        .bind(id,row.name,slug,row.description,row.website || null,JSON.stringify(tags),row.city || null,now,now));
      else if (JSON.stringify(tags)!==item.existing.tags) statements.push(db.prepare('UPDATE organizations SET tags=?,updated_at=? WHERE id=?').bind(JSON.stringify(tags),now,id));
      if (!item.record) {
        const s=row.support;
        statements.push(db.prepare(`INSERT INTO organization_support_records(id,from_organization_id,to_organization_id,from_label,to_label,support_kind,amount,currency,quantity,unit,description,occurred_at,source_url,evidence,notes,status,created_by_user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(recordId,from.id,id,from.name,item.existing?.name || row.name,s.supportKind,s.amount,s.currency,s.quantity,s.unit,s.description,s.occurredAt,s.sourceUrl,s.evidence,s.notes,s.status,actor.id,now));
      }
    }
    statements.push(db.prepare(`INSERT INTO audit_events(id,actor_user_id,action,resource_type,resource_id,metadata_json,created_at) VALUES(?,?,'organization.evidence_import','organization',?,?,?)`)
      .bind(crypto.randomUUID(),actor.id,from.id,JSON.stringify(preview),now));
    await db.batch(statements);
    await finishEventOperation(db,previewId,true,['import_public_evidence']);
    return {previewId,recipients:plan.map(item=>({id:item.id,name:item.existing?.name || item.row.name,slug:item.slug,recordId:item.recordId})),created:plan.filter(item=>!item.existing).length,recorded:plan.filter(item=>!item.record).length};
  } catch (error) { await finishEventOperation(db,previewId,false,[]); throw error; }
}
