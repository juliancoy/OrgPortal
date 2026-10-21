import { useEffect, useState } from 'react'
import { useAuth } from '../../app/AppProviders'
import { personnelClassForMembership, type PersonnelClass } from '../../../../shared/organizationPersonnel'

type Member = { user_id: string; role?: string; status?: string; personnel_class?: string }
export function useOrganizationPersonnel(organizationId: string | null | undefined) {
  const { token } = useAuth()
  const key = `${organizationId || ''}:${token || ''}`
  const [state, setState] = useState<{ key: string; classes: Record<string, PersonnelClass> } | null>(null)
  useEffect(() => {
    if (!organizationId || !token) return
    const controller = new AbortController()
    async function load() {
      const response = await fetch(`/api/org/api/network/orgs/${encodeURIComponent(organizationId!)}/members`, {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
      })
      if (!response.ok) throw new Error('Organization status unavailable')
      const members: Member[] = await response.json()
      if (!controller.signal.aborted) setState({ key, classes: Object.fromEntries(members.map(member => [member.user_id, personnelClassForMembership(member)])) })
    }
    const refresh = () => { void load().catch(() => { if (!controller.signal.aborted) setState(null) }) }
    refresh()
    window.addEventListener('organization-access-change', refresh)
    return () => { controller.abort(); window.removeEventListener('organization-access-change', refresh) }
  }, [organizationId, token, key])
  // Never carry one organization's status into another or label an unreadable record.
  return (userId: string): PersonnelClass | null => state?.key === key ? state.classes[userId] || 'public' : null
}
