import { describe, expect, it } from 'vitest'
import funding from '../../data/tedco-recipient-funding-status.json'
import manifest from '../../data/tedco-recipients.json'
import { fundingAmount, rankRecipients, type RecipientFunding } from './tedcoFunding'

describe('TEDCO descendant funding ranking', () => {
  it('orders known totals descending, preserves tied overall ranks, and leaves unknowns unranked', () => {
    const rows = [null, 100, 300, 300, 0].map((amount, i) => ({ name: `Company ${i}`, totalUsd: amount })) as RecipientFunding[]
    expect(rankRecipients(rows).map(row => [row.totalUsd, row.rank])).toEqual([[300, 1], [300, 1], [100, 3], [0, 4], [null, null]])
    expect(rows[0].totalUsd).toBeNull()
    expect(fundingAmount(null)).toBe('Funding total unknown')
  })
  it('covers every researched recipient exactly once with sourced status or explicit unknown', () => {
    expect(funding.companies.map(row => row.key).sort()).toEqual(manifest.recipients.map(row => row.key).sort())
    expect(new Set(funding.companies.map(row => row.organizationId)).size).toBe(manifest.recipients.length)
    for (const row of funding.companies) {
      expect(row.status.checkedAt).toBe(funding.reviewedAt)
      if (row.status.value !== 'unknown') expect(row.status.sourceUrl).toMatch(/^https:\/\//)
      if (row.totalUsd === null) { expect(row.rank).toBeNull(); expect(row.fundingEvidence).toHaveLength(0) }
      else {
        expect(row.totalUsd).toBeGreaterThan(0)
        expect(Math.round(row.fundingEvidence.reduce((sum, fact) => sum + fact.amountUsd, 0) * 100) / 100).toBe(row.totalUsd)
        for (const fact of row.fundingEvidence) expect(fact.sourceUrl).toMatch(/^https:\/\//)
      }
    }
    expect(rankRecipients(funding.companies as RecipientFunding[]).map(row => [row.key,row.rank])).toEqual(funding.companies.map(row => [row.key,row.rank]))
  })
  it('does not substitute acquirer funding or operating successors for the original company status', () => {
    expect(funding.companies.find(row => row.name === 'Optoro')?.status.value).toBe('acquired')
    const original = funding.companies.find(row => row.name === 'iLearningEngines')
    expect(original?.status.value).toBe('defunct')
    expect(original?.status.additionalSourceUrl).toContain('ilearningengines.com')
    expect(funding.companies.find(row => row.name === 'GrayBug Vision')?.status.value).toBe('merged')
  })
})

it('keeps Pixee’s TEDCO investment separate from its multi-investor seed round',()=>{
 const pixee=funding.companies.find(row=>row.name==='Pixee')! as RecipientFunding
 expect(pixee.totalUsd).toBe(1500000)
 expect(pixee.otherFundingEvidence?.[0].amountUsd).toBe(15000000)
 expect(pixee.fundingEvidence.reduce((total,fact)=>total+fact.amountUsd,0)).toBe(pixee.totalUsd)
 expect(pixee.websiteUrl).toBe('https://www.pixee.ai/')
 expect(pixee.iconUrl).toMatch(/^\/assets\/company-icons\/pixee\./)
})
