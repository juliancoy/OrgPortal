import { z } from 'zod';
import { authorizeOrganization, type OrganizationActor } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { prepareEventOperation, claimEventOperation, finishEventOperation, previewFingerprint, enforceEventRateLimit } from './eventOperationStore';

const evidenceUrl = z.string().url().max(2000).refine(value => {
  const url = new URL(value);
  return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
}, 'Public HTTP or HTTPS evidence URL required');
export const supportSchema = z.object({
  organizationId: z.string().min(1).max(200),
  recipientOrganizationId: z.string().min(1).max(200),
  supportKind: z.enum(['transfer', 'in_kind', 'mentoring', 'venue', 'services', 'incubation', 'acceleration', 'collaboration', 'terms', 'capitalization', 'portfolio', 'coinvestment']),
  amount: z.number().positive().finite().nullable().default(null),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable().default(null),
  quantity: z.number().positive().finite().nullable().default(null),
  unit: z.string().trim().min(1).max(80).nullable().default(null),
  description: z.string().trim().min(1).max(5000),
  occurredAt: z.string().trim().min(1).max(200),
  sourceUrl: evidenceUrl,
  evidence: z.string().trim().min(1).max(2000),
  notes: z.string().max(5000).default(''),
  status: z.enum(['reported', 'delivered']).default('reported'),
  previewId: z.string().uuid().optional(), confirm: z.boolean().optional(),
}).strict();
export const supportTargetSchema = z.object({ organizationId: z.string().min(1).max(200) }).strict();
export const supportVoidSchema = supportTargetSchema.extend({
  recordId: z.string().min(1).max(1000), reason: z.string().trim().min(1).max(2000),
  previewId: z.string().uuid().optional(), confirm: z.boolean().optional(),
}).strict();

async function organization(db: D1Database, id: string) {
  const row = await db.prepare('SELECT id, name, slug FROM organizations WHERE id = ? OR slug = ?')
    .bind(id, id).first<{ id: string; name: string; slug: string }>();
  if (!row) throw new EventIntegrationError(404, 'Organization not found');
  return row;
}

export async function organizationSupport(db: D1Database, organizationId: string, offset = 0) {
  const org = await organization(db, organizationId);
  // UNION (rather than UNION ALL) visits each organization once, including cycles.
  const descendants = await db.prepare(`WITH RECURSIVE reachable(id) AS (
    SELECT to_organization_id FROM organization_support_edges WHERE from_organization_id = ?
    UNION SELECT e.to_organization_id FROM organization_support_edges e JOIN reachable r ON e.from_organization_id = r.id
  ) SELECT o.id, o.name, o.slug, o.tags,
    EXISTS(SELECT 1 FROM organization_support_edges e WHERE e.from_organization_id = ? AND e.to_organization_id = o.id) AS is_direct
    FROM reachable r JOIN organizations o ON o.id = r.id WHERE o.id != ? ORDER BY lower(o.name)`)
    .bind(org.id, org.id, org.id).all();
  const supporters = await db.prepare(`SELECT o.id, o.name, o.slug FROM organization_support_edges e
    JOIN organizations o ON o.id = e.from_organization_id WHERE e.to_organization_id = ? ORDER BY lower(o.name)`)
    .bind(org.id).all();
  const records = await db.prepare(`SELECT * FROM master_transaction_records WHERE record_type = 'organization_support'
    AND (from_organization_id = ? OR to_organization_id = ?) ORDER BY timestamp DESC, id LIMIT 500 OFFSET ?`)
    .bind(org.id, org.id, offset).all();
  const total = await db.prepare(`SELECT count(*) AS n FROM master_transaction_records WHERE record_type = 'organization_support'
    AND (from_organization_id = ? OR to_organization_id = ?)`).bind(org.id, org.id).first<{ n: number }>();
  // Complete canonical totals, independent of paginated evidence. Contextual
  // aggregates are not transfers and reported awards are not delivery.
  const totals = await db.prepare(`WITH directions AS (
    SELECT 'deployed' AS direction, * FROM master_transaction_records WHERE from_organization_id = ?
    UNION ALL SELECT 'received' AS direction, * FROM master_transaction_records WHERE to_organization_id = ?
  ) SELECT direction, currency, status, SUM(amount) AS amount, COUNT(*) AS recordCount,
      SUM(CASE WHEN amount IS NULL THEN 1 ELSE 0 END) AS undisclosedCount
    FROM directions WHERE record_type = 'organization_support' AND transaction_type = 'transfer'
      AND status IN ('reported', 'delivered')
    GROUP BY direction, currency, status ORDER BY direction, currency, status`)
    .bind(org.id, org.id).all();
  return { organization: org, financialTotals: { source: 'master_transaction_records', entries: totals.results || [] }, descendants: (descendants.results || []).map(row => {
    let tags: string[] = [];
    try { const value = JSON.parse(String(row.tags || '[]')); if (Array.isArray(value)) tags = value.filter(item => typeof item === 'string'); } catch {}
    return { ...row, tags };
  }), supporters: supporters.results, records: records.results, recordCount: total?.n || 0,
    nextRecordOffset: offset + (records.results || []).length < (total?.n || 0) ? offset + (records.results || []).length : null };
}

export async function runSupportOperation(db: D1Database, actor: OrganizationActor, operation: 'record' | 'void', input: unknown) {
  const parsed = operation === 'record' ? supportSchema.safeParse(input) : supportVoidSchema.safeParse(input);
  if (!parsed.success) throw new EventIntegrationError(400, parsed.error.issues.map(issue => issue.message).join('; '));
  const { previewId, confirm, ...changes } = parsed.data;
  const from = await organization(db, changes.organizationId);
  await authorizeOrganization(db, actor, 'manage', from.id);
  await enforceEventRateLimit(db, actor.id);
  let to: Awaited<ReturnType<typeof organization>> | null = null;
  if ('recipientOrganizationId' in changes) {
    if ((changes.amount === null) !== (changes.currency === null)) throw new EventIntegrationError(400, 'Amount and currency must be supplied together');
    if ((changes.quantity === null) !== (changes.unit === null)) throw new EventIntegrationError(400, 'Quantity and unit must be supplied together');
    if (!['transfer','terms','capitalization','portfolio','coinvestment'].includes(changes.supportKind) && changes.amount !== null)
      throw new EventIntegrationError(400, 'Use quantity and unit for nonmonetary support; do not record it as money');
    to = await organization(db, changes.recipientOrganizationId);
    if (from.id === to.id) throw new EventIntegrationError(400, 'An organization cannot support itself');
  } else {
    const row = await db.prepare("SELECT id FROM organization_support_records WHERE id = ? AND from_organization_id = ? AND status != 'voided'")
      .bind(changes.recordId, from.id).first();
    if (!row) throw new EventIntegrationError(404, 'Active support record not found for this organization');
  }
  const preview = { operation, changes, from, to, effect: 'Records organizational support in the master record; no account balances change.' };
  const owner = { userId: actor.id, organizationId: from.id, eventId: `organization:support:${operation}` };
  const fingerprint = await previewFingerprint(preview);
  if (!confirm) return { ...preview, ...await prepareEventOperation(db, owner, fingerprint) };
  if (!previewId) throw new EventIntegrationError(409, 'Request a preview first and supply its previewId');
  await claimEventOperation(db, owner, previewId, fingerprint);
  const now = new Date().toISOString();
  const recordId = 'recordId' in changes ? changes.recordId : `support-${previewId}`;
  try {
    const mutation = 'recipientOrganizationId' in changes
      ? db.prepare(`INSERT INTO organization_support_records
        (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, quantity, unit,
         description, occurred_at, source_url, evidence, notes, status, created_by_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(recordId, from.id, to!.id, from.name, to!.name, changes.supportKind, changes.amount, changes.currency,
          changes.quantity, changes.unit, changes.description, changes.occurredAt, changes.sourceUrl, changes.evidence, changes.notes, changes.status, actor.id, now)
      : db.prepare("UPDATE organization_support_records SET status = 'voided', void_reason = ? WHERE id = ? AND from_organization_id = ?")
        .bind(changes.reason, recordId, from.id);
    await db.batch([mutation, db.prepare(`INSERT INTO audit_events
      (id, actor_user_id, action, resource_type, resource_id, metadata_json, created_at)
      VALUES (?, ?, ?, 'organization_support', ?, ?, ?)`)
      .bind(crypto.randomUUID(), actor.id, `organization.support_${operation}`, recordId, JSON.stringify(preview), now)]);
    await finishEventOperation(db, previewId, true, [operation]);
    return { recordId, previewId, result: await organizationSupport(db, from.id) };
  } catch (error) {
    await finishEventOperation(db, previewId, false, []);
    throw error;
  }
}

export async function runSupportMcp(db: D1Database, identity: { userId: string; scopes: string[] }, operation: 'list' | 'record' | 'void', input: unknown) {
  if (!identity.scopes.includes('org:portal.read') || (operation !== 'list' && !identity.scopes.includes('org:portal.write')))
    throw new EventIntegrationError(403, 'Missing portal scope');
  if (operation === 'list') return organizationSupport(db, supportTargetSchema.parse(input).organizationId);
  return runSupportOperation(db, { id: identity.userId, name: identity.userId, email: null, isOperator: false }, operation, input);
}
