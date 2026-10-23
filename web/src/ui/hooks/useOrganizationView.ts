import { useEffect, useState } from 'react'
import { useAuth } from '../../app/AppProviders'

export const organizationViews = ['public', 'attendees', 'volunteers', 'members', 'organizers'] as const
export type OrganizationView = typeof organizationViews[number]
export function resolveOrganizationView(value: string | null, organizer: boolean, member: boolean): OrganizationView {
  if (value === 'organizers' && organizer) return value
  if (value === 'members' && member) return value
  if (value === 'public' || value === 'attendees' || value === 'volunteers') return value
  return organizer ? 'organizers' : member ? 'members' : 'public'
}

// Public profiles always render the public view.
export function resolveOrganizationPageView(dashboard: boolean, requested: string | null, organizer: boolean, member: boolean): OrganizationView {
  return dashboard ? resolveOrganizationView(requested === 'public' ? null : requested, organizer, member) : 'public'
}

// The URL is the only source of view selection; nothing is persisted.
export function useOrganizationViewPreference(_slug: string | null | undefined, requested: string | null) {
  return organizationViews.includes(requested as OrganizationView) ? requested as OrganizationView : null
}

export function useOrganizationAccess(slug: string | null | undefined) {
  const { token, isLoading } = useAuth()
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1)
    window.addEventListener('organization-access-change', refresh)
    return () => window.removeEventListener('organization-access-change', refresh)
  }, [])
  const [access, setAccess] = useState<{ key: string; organizer: boolean; member: boolean } | null>(null)
  const key = `${slug || ''}:${token || ''}`
  useEffect(() => {
    if (!slug || !token || isLoading) return
    const controller = new AbortController()
    async function load() {
      const response = await fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(slug!)}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      if (!response.ok) throw new Error('Membership unavailable')
      const group = await response.json() as { id: string }
      let role: string | null = null
      if (group) {
        const membership = await fetch(`/api/org/api/network/orgs/${encodeURIComponent(group.id)}/membership`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
        if (membership.ok) {
          const data = await membership.json() as { role: string | null; status: string }
          if (data.status === 'active') role = data.role
        }
      }
      if (!controller.signal.aborted) setAccess({ key, organizer: role === 'owner' || role === 'administrator', member: !!role })
    }
    void load().catch(() => { if (!controller.signal.aborted) setAccess({ key, organizer: false, member: false }) })
    return () => controller.abort()
  }, [slug, token, isLoading, key, revision])
  const current = access?.key === key ? access : null
  return { organizer: current?.organizer || false, member: current?.member || false, loading: isLoading || !!(slug && token && !current) }
}
