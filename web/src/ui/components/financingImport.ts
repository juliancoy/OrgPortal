import { type EvidenceManifest } from './organizationEvidenceImport'
import { type FundingReport } from './tedcoFunding'
import { type FinancingEvent, type FinancingReport } from './companyFinancing'
export async function financingImportBatches(manifest: EvidenceManifest, funding: FundingReport, ledger: FinancingReport, registeredOrganizationIds: string[] = []) {
  const events: (Omit<FinancingEvent, 'type'> & {type: string; includedInEventId?: string})[] = [...ledger.events]
  const occurrences = new Map<string, number>()
  for (const company of funding.companies) for (const fact of company.fundingEvidence) {
    // A source table can contain multiple investments on the same date. Keep
    // each source-row occurrence distinct, without using its mutable amount.
    const identity = JSON.stringify([manifest.organizationId,company.key,fact.sourceUrl,fact.asOf,fact.kind])
    const occurrence = occurrences.get(identity) || 0
    occurrences.set(identity, occurrence + 1)
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${identity}:${occurrence}`)))].map(b=>b.toString(16).padStart(2,'0')).join('')
    events.push({id:`agency-${hash}`,companyKey:company.key,announcedAt:fact.asOf,label:fact.kind,type:'agency',amountUsd:fact.amountUsd,amountQualifier:'exact',investors:[],sourceUrls:[fact.sourceUrl],notes:fact.evidence,tags:[...new Set([...(fact.tags || []),...(/^TEDCO portfolio table:/i.test(fact.evidence) ? ['portfolio:TEDCO'] : [])])],
      ...(company.name === 'Pixee' && fact.amountUsd === 1500000 ? {includedInEventId:ledger.events.find(e=>e.companyKey===company.key&&e.label==='Seed round')!.id} : {})})
  }
  const batches=[]
  for(let offset=0;offset<manifest.recipients.length;offset+=25){
    const recipients=manifest.recipients.slice(offset,offset+25).map(research=>{
      const company=funding.companies.find(c=>c.key===research.key)!
      const {totalUsd:_total,rank:_rank,fundingEvidence:_facts,allFundingEvidence:_all,otherFundingEvidence:_other,...metadata}=company
      void _total; void _rank; void _facts; void _all; void _other
      return {key:research.key,name:research.name,organizationId:registeredOrganizationIds.includes(company.organizationId) ? company.organizationId : research.existingOrganizationId,metadata,research,audit:ledger.audit.find(a=>a.key===research.key)!}
    })
    batches.push({organizationId:manifest.organizationId,reviewedAt:ledger.reviewedAt,recipients,events:events.filter(e=>recipients.some(r=>r.key===e.companyKey))})
  }
  return batches
}
