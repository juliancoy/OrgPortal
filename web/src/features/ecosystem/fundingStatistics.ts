export type FundingOrganization = { id: string; name: string; category?: string; website?: string }
export type FundingRound = { id: string; recipient: string; recipientId?: string | null; type: string; kind: string; amount: number | null; currency?: string; date: string; sourceUrl: string; evidence?: string; notes?: string; region?: string; roundKey?: string | null }
export type CompanyFunding = { id: string; name: string; portal: boolean; region: string; stage: string; stageRank: number; highest: FundingRound | null; largest: FundingRound | null; seriesA: FundingRound | null; rounds: FundingRound[]; seedToAMonths: number | null }
export const companyKey = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(inc|llc|limited|ltd)\b/g, '').replace(/[^a-z0-9]/g, '')
export function fundingStage(type: string): { label: string; rank: number } | null {
  if (/grant|award|prize|loan|debt|fund capital|portfolio|aggregate|commitment|program terms|seeking|target|planned/i.test(type)) return null
  if (/pre[- ]series\s+a\b/i.test(type)) return { label: 'Pre-Series A', rank: 2 }
  const series = type.match(/\bseries\s+([a-z])(?:\b|\d)/i)
  if (series) return { label: `Series ${series[1].toUpperCase()}`, rank: 3 + series[1].toUpperCase().charCodeAt(0) - 65 }
  if (/pre[- ]?seed/i.test(type)) return { label: 'Pre-seed', rank: 1 }
  if (/\bseed\b|\bangel\b/i.test(type)) return { label: 'Seed / angel', rank: 2 }
  return null
}
const usdAmount = (r: FundingRound) => (!r.currency || r.currency.toUpperCase() === 'USD') && typeof r.amount === 'number' && Number.isFinite(r.amount) && r.amount > 0 ? r.amount : null
const largest = (rounds: FundingRound[]) => rounds.filter(r => usdAmount(r) !== null).sort((a,b) => usdAmount(b)! - usdAmount(a)! || b.date.localeCompare(a.date))[0] || null
const month = (date: string) => /^\d{4}-(0[1-9]|1[0-2])(?:$|-\d{2}$)/.test(date) ? Number(date.slice(0,4)) * 12 + Number(date.slice(5,7)) - 1 : null
export function compileFunding(organizations: FundingOrganization[], financing: FundingRound[], research: FundingRound[], asOf: string): CompanyFunding[] {
  const companies = new Map<string, CompanyFunding>()
  const ids = new Map(organizations.map(o => [o.id, companyKey(o.name)]))
  const add = (name: string, id: string, portal: boolean, region = '') => {
    const key = companyKey(name), previous = companies.get(key)
    if (previous) { previous.portal ||= portal; previous.region ||= region; return previous }
    const company: CompanyFunding = { id, name, portal, region, stage: 'Unknown', stageRank: 0, highest: null, largest: null, seriesA: null, rounds: [], seedToAMonths: null }
    companies.set(key, company); return company
  }
  for (const org of organizations) if (org.category === 'company') add(org.name, org.id, true)
  for (const round of research) {
    const matched = organizations.find(o => companyKey(o.name) === companyKey(round.recipient))
    add(matched?.name || round.recipient, matched?.id || companyKey(round.recipient), Boolean(matched), round.region)
  }
  const seen = new Set<string>()
  for (const round of [...financing, ...research]) {
    if (round.kind !== 'transfer' || (!fundingStage(round.type) && round.type !== 'Financing round (stage undisclosed)') || !round.date || round.date > asOf || !/^https?:\/\//i.test(round.sourceUrl)) continue
    const key = (round.recipientId && ids.get(round.recipientId)) || companyKey(round.recipient)
    const company = companies.get(key); if (!company) continue
    const duplicate = `${key}|${(fundingStage(round.type)?.label || 'Unknown')}|${round.date}|${round.amount}|${round.type.toLowerCase()}`
    if (seen.has(duplicate)) continue; seen.add(duplicate)
    company.rounds.push(round)
  }
  for (const company of companies.values()) {
    // Closing updates refer to the same round, not additional financings.
    const families = new Map<string, FundingRound>()
    for (const round of company.rounds) if (round.roundKey) {
      const prior = families.get(round.roundKey)
      if (!prior || prior.date < round.date) families.set(round.roundKey, round)
    }
    company.rounds = company.rounds.filter(r => !r.roundKey || families.get(r.roundKey) === r)
    company.highest = [...company.rounds].sort((a,b) => (fundingStage(b.type)?.rank || 0) - (fundingStage(a.type)?.rank || 0) || b.date.localeCompare(a.date))[0] || null
    const stage = company.highest && fundingStage(company.highest.type)
    company.stage = stage?.label || 'Unknown'; company.stageRank = stage?.rank || 0
    company.largest = largest(company.rounds)
    company.seriesA = largest(company.rounds.filter(r => fundingStage(r.type)?.label === 'Series A'))
    const seeds = company.rounds.filter(r => Boolean(fundingStage(r.type)) && fundingStage(r.type)!.rank <= 2).map(r => month(r.date)).filter((m): m is number => m !== null)
    const aDates = company.rounds.filter(r => fundingStage(r.type)?.label === 'Series A').map(r => month(r.date)).filter((m): m is number => m !== null)
    if (seeds.length && aDates.length && Math.min(...aDates) >= Math.min(...seeds)) company.seedToAMonths = Math.min(...aDates) - Math.min(...seeds)
  }
  return [...companies.values()].sort((a,b) => b.stageRank - a.stageRank || (b.largest?.amount || 0) - (a.largest?.amount || 0) || a.name.localeCompare(b.name))
}
export function median(values: number[]) { const sorted = [...values].sort((a,b)=>a-b), n=sorted.length; return n ? (sorted[Math.floor(n/2)] + sorted[Math.ceil(n/2)-1])/2 : null }
export function fundingSummary(companies: CompanyFunding[]) {
  const known = companies.filter(c => c.stageRank > 0)
  const seedOnly = known.filter(c => c.stageRank <= 2)
  const atA = known.filter(c => c.stageRank === 3)
  const beyondA = known.filter(c => c.stageRank > 3)
  const aAmounts = companies.flatMap(c => c.seriesA ? [c.seriesA.amount!] : [])
  const transitions = companies.flatMap(c => c.seedToAMonths === null ? [] : [c.seedToAMonths])
  return { total: companies.length, known: known.length, unknown: companies.length-known.length, seedOnly: seedOnly.length, atA: atA.length, beyondA: beyondA.length, seriesAMedian: median(aAmounts), seriesAMax: aAmounts.length ? Math.max(...aAmounts) : null, seriesAMin: aAmounts.length ? Math.min(...aAmounts) : null, seriesAAmountCount: aAmounts.length, transitionMedian: median(transitions), transitionCount: transitions.length }
}
export function fundingCsv(companies: CompanyFunding[]) {
  const cell = (value: unknown) => { const s=String(value ?? ''); return '"'+(/^[=+@\-\t\r]/.test(s) ? "'"+s : s).replace(/"/g,'""')+'"' }
  const header=['Company','Highest documented stage','Highest stage date','Largest disclosed USD round','Largest round type','Largest round date','Largest round source','Highest stage source','Scope','Notes']
  return [header, ...companies.map(c => [c.name,c.stage,c.highest?.date,c.largest?.amount,c.largest?.type,c.largest?.date,c.largest?.sourceUrl,c.highest?.sourceUrl,c.portal?'Portal':'Regional research',c.largest?.notes])].map(row=>row.map(cell).join(',')).join('\r\n')
}
