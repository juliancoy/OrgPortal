import { useLocation, useNavigate } from 'react-router-dom'
import { getDomainTenant } from '../../config/timebankCommunity'
import { organizationViews, resolveOrganizationView, useOrganizationAccess, useOrganizationViewPreference, saveOrganizationView } from '../hooks/useOrganizationView'

export function OrganizationViewSwitcher({ indicator = false }: { indicator?: boolean }) {
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.match(/^\/orgs\/([^/]+)\/?$/)
  const slug = match && !['login', 'register', 'profile', 'account', 'initiatives', 'events'].includes(match[1]) ? decodeURIComponent(match[1]) : getDomainTenant()?.home_org_slug
  const access = useOrganizationAccess(slug)
  const requested = useOrganizationViewPreference(slug, new URLSearchParams(location.search).get('view'))
  if (!slug) return null
  const view = resolveOrganizationView(requested, access.organizer, access.member)
  if (indicator) return access.loading ? null : <span className="organization-view-indicator" role="status" aria-label={`Active organization view: ${view}`}>View: {view[0].toUpperCase() + view.slice(1)}</span>
  return <label className="organization-view-switcher" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.85rem' }}>
    <span>View as</span>
    <select aria-label="Organization view" value={view} disabled={access.loading} onChange={event => {
      const next = resolveOrganizationView(event.target.value, access.organizer, access.member)
      saveOrganizationView(slug, next)
      navigate(`/orgs/${encodeURIComponent(slug)}?view=${next}`)
    }}>
      {organizationViews.map(value => <option key={value} value={value} disabled={(value === 'members' && !access.member) || (value === 'organizers' && !access.organizer)}>{value[0].toUpperCase() + value.slice(1)}</option>)}
    </select>
  </label>
}
