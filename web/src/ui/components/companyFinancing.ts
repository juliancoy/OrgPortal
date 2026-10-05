export type FinancingEvent = {
  id: string; companyKey: string; announcedAt: string; label: string
  type: 'equity' | 'debt' | 'grant' | 'acquisition' | 'cumulative'
  amountUsd: number; amountQualifier: 'exact' | 'over' | 'up-to'
  investors: string[]; sourceUrls: string[]; notes: string
}
export type FinancingAudit = {
  key: string; name: string; status: 'partial' | 'pending'
  searchedAt: string | null; reviewedAt: string | null; nextReviewAt: string
  priority: number; query: string; candidateSources: { title: string; url: string; outcome?: 'verified' | 'pending'; transactionIds?: string[] }[]
}
export type FinancingReport = { reviewedAt: string; methodology: string; events: FinancingEvent[]; audit: FinancingAudit[] }

// A second announcement of the same round must use the same event id.
// Cumulative figures, grants, debt and purchase prices never enter the equity subtotal.
export function equitySubtotal(events: FinancingEvent[]): number | null {
  const rounds = [...new Map(events.filter(event => event.type === 'equity' && event.amountQualifier !== 'up-to').map(event => [event.id, event])).values()]
  return rounds.length ? rounds.reduce((sum, event) => sum + event.amountUsd, 0) : null
}
