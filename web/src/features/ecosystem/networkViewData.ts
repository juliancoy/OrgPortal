import { refreshPublicReport } from '../../data/publicOrganization/cache'
import { portalPath } from '../../config/portalBase'
import { mergeNetworkHistory } from './network-history.js'
import { loadPortalEvidence } from './portal-ecosystem.js'

export type NetworkOrganization = { id: string; name: string }
export type NetworkEvent = { id: string; title: string; date: string; sourceUrl: string; organizationId: string | null; organizationName: string; location: string }
export type NetworkRelationship = { id: string; source: string | null; target: string | null; sourceLabel: string; targetLabel: string; type: string; kind: string; relationship: string; date: string }
export type NetworkData = {
  organizations: NetworkOrganization[]; relationships: NetworkRelationship[]; financing: unknown[];
  events?: NetworkEvent[]; lastCheckedAt?: number; offline?: boolean;
}

export async function loadNetworkViewData(view: 'events' | 'relationships', signal: AbortSignal): Promise<NetworkData> {
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
  const [base, history] = await Promise.all([
    read(portalPath('/ecosystem-data/ecosystem-portal.json'), snapshot),
    read(portalPath(`/ecosystem-data/ecosystem-${view === 'events' ? 'history' : 'relationships'}.json`), snapshot),
  ])
  const fetcher = async (url: string) => {
    const value = await read(url, value => {
      if (url.includes('/orgs/public?') ? !Array.isArray(value) : !Array.isArray((value as { records?: unknown[] })?.records)) throw Error('Public evidence is incomplete')
      return value
    })
    return { ok: true, status: 200, json: async () => value }
  }
  const data = mergeNetworkHistory(await loadPortalEvidence(base, fetcher), history)
  return { ...data, lastCheckedAt, offline }
}
