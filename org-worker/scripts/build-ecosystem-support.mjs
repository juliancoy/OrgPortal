// Import only the already-public normalized MedTech snapshot, never raw sheets.
// Produces reviewable SQL; does not contact or mutate a database.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function ecosystemSupportSql(data) {
  if (data.schemaVersion !== 1 || !Array.isArray(data.organizations) || !Array.isArray(data.financing) || !Array.isArray(data.relationships)) throw new Error('Unsupported ecosystem snapshot');
  const quote = value => value == null ? 'NULL' : typeof value === 'number' ? (Number.isFinite(value) ? String(value) : (() => { throw new Error('Invalid amount'); })()) : "'" + String(value).replaceAll("'", "''") + "'";
  const url = value => { const parsed = new URL(value); if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Unsafe source URL'); return parsed.href; };
  const ids = new Set(data.organizations.map(org => org.id));
  if (ids.size !== data.organizations.length) throw new Error('Duplicate organization identity');
  const endpoint = id => { if (!id) return 'NULL'; if (!ids.has(id)) throw new Error(`Unknown organization: ${id}`); return `(SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = ${quote(id)})`; };
  const provenance = record => ({ source: data.source, snapshot: data.updatedAt, ...record.provenance, sourceUrl: record.sourceUrl, fromLabel: record.funder || record.sourceLabel, toLabel: record.recipient || record.targetLabel, date: record.date, type: record.type, description: record.description, amountLabel: record.amountLabel, evidence: record.evidence, notes: record.notes });
  const sql = [`-- Generated from ../bmoremedtech/assets/data/ecosystem.json (${data.updatedAt}).`, '-- Public evidence only. No payments, identities, roles or permissions are created.', `CREATE TABLE IF NOT EXISTS organization_source_identities (
    source TEXT NOT NULL, external_id TEXT NOT NULL,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    PRIMARY KEY (source, external_id)
  );`];
  for (const org of data.organizations) {
    if (!/^org-[a-z0-9-]+$/.test(org.id)) throw new Error('Invalid source organization ID');
    const slug = org.id.slice(4);
    sql.push(`INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES (${[org.id,org.name,slug,org.relevance || org.type,org.website ? url(org.website) : null,JSON.stringify([org.category,org.type]),'Baltimore',data.updatedAt,data.updatedAt].map(quote).join(', ')});`);
    sql.push(`INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', ${quote(org.id)}, id FROM organizations WHERE slug = ${quote(slug)};`);
  }
  const records = new Map();
  for (const f of data.financing) records.set(f.id, {
    id: f.id, from: f.funderId, to: f.recipientId, fromLabel: f.funder, toLabel: f.recipient, kind: f.kind,
    amount: f.amount, amountLabel: f.amountLabel, description: f.type, date: f.date,
    sourceUrl: f.sourceUrl, evidence: f.evidence, notes: [f.scope, f.notes].filter(Boolean).join(' · '), provenance: [provenance(f)],
  });
  for (const edge of data.relationships) {
    const matched = records.get(edge.financingId);
    // Preserve matched sheet evidence once. Reject mismatched named endpoints
    // rather than attributing a collective source to a particular investor.
    if (matched && matched.from === edge.source && matched.to === edge.target) {
      matched.provenance.push(provenance(edge));
      continue;
    }
    records.set(edge.id, { id: edge.id, from: edge.source, to: edge.target, fromLabel: edge.sourceLabel, toLabel: edge.targetLabel,
      kind: edge.kind || edge.relationship, amount: edge.amount, amountLabel: edge.amountLabel,
      description: [edge.type,edge.description].filter(Boolean).join(' · '), date: edge.date,
      sourceUrl: edge.sourceUrl, evidence: edge.evidence, notes: edge.notes, provenance: [provenance(edge)] });
  }
  for (const row of records.values()) {
    if (!['transfer','terms','capitalization','portfolio','coinvestment','affiliation','incubation','acceleration','collaboration'].includes(row.kind)) throw new Error(`Invalid kind: ${row.kind}`);
    const values = [quote(`bmoremedtech:${row.id}`),endpoint(row.from),endpoint(row.to),quote(row.fromLabel),quote(row.toLabel),quote(row.kind),quote(row.amount),quote(row.amount == null ? null : 'USD'),quote(row.amountLabel || ''),quote(row.description),quote(row.date || ''),quote(url(row.sourceUrl)),quote(row.evidence || ''),quote(row.notes || ''),quote(JSON.stringify(row.provenance)),quote(data.updatedAt)];
    sql.push(`INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES (${values.join(', ')});`);
  }
  return sql.join('\n\n') + '\n';
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const input = process.argv[2] || new URL('../../../bmoremedtech/assets/data/ecosystem.json', import.meta.url).pathname;
  const output = process.argv[3] || new URL('../migrations/0058_medtech_ecosystem_support.sql', import.meta.url).pathname;
  const data = JSON.parse(readFileSync(input, 'utf8'));
  writeFileSync(output, ecosystemSupportSql(data));
  console.log(`Wrote ${output} from public snapshot ${data.updatedAt}`);
}
