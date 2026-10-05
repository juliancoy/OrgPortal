export type FundingEvidence = { amountUsd: number; sourceUrl: string; asOf: string; kind: string; evidence: string }
export type RecipientStatus = { value: 'operating' | 'acquired' | 'merged' | 'defunct' | 'unknown'; asOf: string | null; checkedAt: string; sourceUrl: string | null; additionalSourceUrl?: string; evidence: string }
export type RecipientFunding = { key: string; name: string; organizationId: string; organizationSlug?: string; totalUsd: number | null; rank: number | null; fundingEvidence: FundingEvidence[]; allFundingEvidence: FundingEvidence[]; status: RecipientStatus }
export type FundingReport = { reviewedAt: string; methodology: string; companies: RecipientFunding[] }
export const statusLabels = { operating: 'Operating (reported)', acquired: 'Bought / acquired', merged: 'Merged', defunct: 'Defunct / liquidating', unknown: 'Status unknown' }
export function rankRecipients(companies: RecipientFunding[]) {
  const sorted = [...companies].sort((a, b) => a.totalUsd === null ? b.totalUsd === null ? a.name.localeCompare(b.name) : 1 : b.totalUsd === null ? -1 : b.totalUsd - a.totalUsd || a.name.localeCompare(b.name))
  let last: number | null = null; let rank: number | null = null
  return sorted.map((company, index) => {
    if (company.totalUsd !== null) { if (company.totalUsd !== last) rank = index + 1; last = company.totalUsd }
    return { ...company, rank: company.totalUsd === null ? null : rank }
  })
}
export function fundingAmount(amount: number | null) {
  return amount === null ? 'Funding total unknown' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)
}
