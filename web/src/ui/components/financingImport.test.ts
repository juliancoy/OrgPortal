import { describe, expect, it } from 'vitest'
import manifest from '../../data/tedco-recipients.json'
import funding from '../../data/tedco-recipient-funding-status.json'
import financing from '../../data/tedco-company-financing.json'
import { financingImportBatches } from './financingImport'
import type { EvidenceManifest } from './organizationEvidenceImport'
import type { FundingReport } from './tedcoFunding'
import type { FinancingReport } from './companyFinancing'
describe('reviewed canonical financing imports', () => {
  it('covers the full recipient roster and uses verified registered organization IDs', async () => {
    const registered = funding.companies.map(company => company.organizationId)
    const batches = await financingImportBatches(manifest as EvidenceManifest, funding as FundingReport, financing as FinancingReport, registered)
    const recipients = batches.flatMap(batch => batch.recipients)
    expect(recipients).toHaveLength(578)
    expect(new Set(recipients.map(recipient => recipient.key)).size).toBe(578)
    for (const batch of batches) { expect(batch.recipients.length).toBeLessThanOrEqual(25); expect(batch.events.length).toBeLessThanOrEqual(250) }
    for (const recipient of recipients) expect(recipient.organizationId).toBe(funding.companies.find(company => company.key === recipient.key)?.organizationId)
    const unmatched = await financingImportBatches(manifest as EvidenceManifest, funding as FundingReport, financing as FinancingReport)
    for (const recipient of unmatched.flatMap(batch => batch.recipients)) expect(recipient.organizationId).toBe(manifest.recipients.find(row => row.key === recipient.key)?.existingOrganizationId)
  })
})
