export type FundingRow = {
 direction: 'deployed' | 'received'; currency: string | null; status: string; amount: number | null;
 financialFactType?: string; measurement?: string; fiscalYear?: number | null;
 name?: string; slug?: string | null; counterpartKey?: string; recordCount: number;
 undisclosedCount: number; lowerBoundCount: number;
}
export type FundingFact = { id: string; support_record_id: string | null; fact_type: string; scope: string; amount: number | null; currency: string | null; fiscal_year: number | null; included_in_fact_id: string | null; source_url: string }
export type EvidenceRecord = { record_id: string; from_organization_id: string | null; to_organization_id: string | null; to_organization_slug: string | null; to_label: string | null; status: string; description?: string }
export type Program = { id: string; program_name: string; agency_label?: string; max_amount_str?: string; url?: string; compass_url?: string }
export type FundingReport = {
 organization: { id: string; name: string; slug: string };
 financialTotals: { entries: FundingRow[]; counterparties: FundingRow[] };
 fundingFacts?: { records: FundingFact[]; nextOffset: number | null };
 fundingPrograms?: { records: Program[]; nextOffset: number | null };
 records: EvidenceRecord[];
}
export const fundingGroup = (row: FundingRow) => JSON.stringify([row.currency,row.status,row.financialFactType || 'unclassified',row.measurement || 'unspecified',row.fiscalYear ?? null])
export function rankFunding(rows: FundingRow[], direction: FundingRow['direction'], group: string) {
 return rows.filter(row => row.direction === direction && fundingGroup(row) === group)
  .sort((a,b) => (b.amount ?? -1) - (a.amount ?? -1) || (a.name || '').localeCompare(b.name || ''))
}
export function agencyExpenditure(report: FundingReport, year: number) {
 const rows = new Map<string,{ name: string; slug: string | null; amount: number; source: string }>()
 const seen = new Set<string>()
 for (const fact of report.fundingFacts?.records || []) {
  if (seen.has(fact.id) || fact.fact_type !== 'agency_expenditure' || fact.scope !== 'agency' || fact.currency !== 'USD' || fact.fiscal_year !== year || fact.included_in_fact_id || fact.amount === null) continue
  seen.add(fact.id)
  const evidence = report.records.find(record => record.record_id === fact.support_record_id && record.status !== 'voided')
  if (!evidence) continue
  const name = evidence.to_label || report.organization.name
  const key = evidence.to_organization_id || name
  const row = rows.get(key) || { name, slug: evidence.to_organization_slug, amount: 0, source: fact.source_url }
  row.amount += fact.amount; rows.set(key,row)
 }
 return [...rows.values()].sort((a,b)=>b.amount-a.amount || a.name.localeCompare(b.name))
}
