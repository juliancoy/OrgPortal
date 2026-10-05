import { useLocation, useNavigate } from 'react-router-dom'
import { getDomainTenant } from '../../config/timebankCommunity'
import { organizationViews, resolveOrganizationView, useOrganizationAccess } from '../hooks/useOrganizationView'

export function OrganizationViewSwitcher() {
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.match(/^\/orgs\/([^/]+)\/?$/)
  const slug = match && !['login', 'register', 'profile', 'account', 'initiatives', 'events'].includes(match[1]) ? decodeURIComponent(match[1]) : getDomainTenant()?.home_org_slug
  const access = useOrganizationAccess(slug)
  if (!slug) return null
  const view = resolveOrganizationView(new URLSearchParams(location.search).get('view'), access.organizer, access.member)
  return <label className="organization-view-switcher" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.85rem' }}>
    <span>View as</span>
    <select aria-label="Organization view" value={view} disabled={access.loading} onChange={event => navigate(`/orgs/${encodeURIComponent(slug)}?view=${event.target.value}`)}>
      {organizationViews.map(value => <option key={value} value={value} disabled={(value === 'members' && !access.member) || (value === 'organizers' && !access.organizer)}>{value[0].toUpperCase() + value.slice(1)}</option>)}
    </select>
  </label>
}
