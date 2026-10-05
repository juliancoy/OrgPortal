import type { EvidenceManifest } from './organizationEvidenceImport'
import type { FundingReport } from './tedcoFunding'
import type { FinancingReport } from './companyFinancing'
export type RecipientReport = { manifest: EvidenceManifest; funding: FundingReport; financing: FinancingReport; consistency?: { mode: string; stale?: boolean; applied_at?: string } }
/** Published evidence remains visible while its reviewed transactional import is pending. */
export function needsPublishedTedcoRoster(organizationId: string, report: RecipientReport) {
  return organizationId === 'org-tedco' && report.manifest.recipients.length === 0
}
