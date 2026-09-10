import { useSyncExternalStore } from 'react'

export type TimebankCommunity = { id: string; hostname: string; name: string; tagline: string; accent_color: string }
let community: TimebankCommunity | null = null
const listeners = new Set<() => void>()
export function getDomainCommunity() { return community?.id !== 'code-collective' ? community : null }
export function timebankHomePath() { return getDomainCommunity() ? '/' : '/timebanking' }
export function setDomainCommunity(value: TimebankCommunity) {
  community = value
  for (const listener of listeners) listener()
}
export function useDomainCommunity() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, getDomainCommunity, () => null)
}
export async function loadDomainCommunity() {
  const response = await fetch('/api/org/api/portal/tenant', { signal: AbortSignal.timeout(5000) })
  if (response.ok) setDomainCommunity(await response.json() as TimebankCommunity)
}
