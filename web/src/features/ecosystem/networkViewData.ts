import { refreshPublicReport } from '../../data/publicOrganization/cache'
import { portalPath } from '../../config/portalBase'
import { mergeNetworkHistory, appendNonprofitEvidence } from './network-history.js'
import { loadPortalEvidence } from './portal-ecosystem.js'

export type NetworkOrganization = { id: string; name: string }
export type NetworkEvent = { id: string; title: string; date: string; sourceUrl: string; organizationId: string | null; organizationName: string; location: string }
export type NetworkRelationship = { id: string; source: string | null; target: string | null; sourceLabel: string; targetLabel: string; type: string; kind: string; relationship: string; date: string }
export type NonprofitProfile = { ein:string; organizationId:string; name:string; formType:string; periodStart:string; periodEnd:string; taxYear:number; filedAt:string; amended:boolean; accountingBasis:string; sourceUrl:string; archiveUrl:string; retrievedAt:string; revenue:number|null; expenses:number|null; assets:number|null; liabilities:number|null; propublicaUrl:string; apiLatestTaxPeriod?:string|null }
export type NetworkData = {
  nonprofitCoverage?: {indexYear:number;scope:string;profileCount:number;grantRecordCount:number;retrievedAt:string}; nonprofitProfiles?:NonprofitProfile[];
  organizations: NetworkOrganization[]; relationships: NetworkRelationship[]; financing: unknown[];
  governmentCoverage?: { start: string; end: string; retrievedAt?: string; recipientState: string };
  events?: NetworkEvent[]; lastCheckedAt?: number; offline?: boolean;
}

export async function loadNetworkViewData(view: 'events' | 'relationships' | 'overview', signal: AbortSignal): Promise<NetworkData> {
  let lastCheckedAt = Infinity, offline = false
  async function read<T>(url: string, validate: (value: unknown) => T): Promise<T> {
    let saved: { data: T; checkedAt: number } | undefined
    try {
      const entry = await refreshPublicReport(url, { signal, validate, onCached: entry => { saved = entry } })
      lastCheckedAt = Math.min(lastCheckedAt, entry.checkedAt)
      return entry.data
    } catch (error) {
      if (!saved || signal.aborted) throw error
      offline = true; lastCheckedAt = Math.min(lastCheckedAt, saved.checkedAt)
      return saved.data
    }
  }
  const snapshot = (value: unknown): NetworkData => {
    const data = value as NetworkData
    if (!data || !Array.isArray(data.organizations) || !Array.isArray(data.relationships) || !Array.isArray(data.financing)) throw Error('Public data is incomplete')
    return data
  }
  const [base, archive, eventArchive, nonprofit] = await Promise.all([
    read(portalPath('/ecosystem-data/ecosystem-portal.json'), snapshot),
    read(portalPath(`/ecosystem-data/ecosystem-${view === 'events' ? 'history' : 'relationships'}.json`), snapshot),
    view === 'overview' ? read(portalPath('/ecosystem-data/ecosystem-history.json'), snapshot) : Promise.resolve(null),
    read(portalPath('/ecosystem-data/ecosystem-nonprofits.json'), snapshot),
  ])
  const history=appendNonprofitEvidence(archive,nonprofit)
  const fetcher = async (url: string) => {
    const value = await read(url, value => {
      if (url.includes('/orgs/public?') ? !Array.isArray(value) : !Array.isArray((value as { records?: unknown[] })?.records)) throw Error('Public evidence is incomplete')
      return value
    })
    return { ok: true, status: 200, json: async () => value }
  }
  let directory = base
  try { directory = await loadPortalEvidence(base, fetcher) }
  catch (error) { if (signal.aborted) throw error; offline = true }
  const data = mergeNetworkHistory(directory, history)
  if (eventArchive) data.events = eventArchive.events
  return { ...data, lastCheckedAt, offline }
}
