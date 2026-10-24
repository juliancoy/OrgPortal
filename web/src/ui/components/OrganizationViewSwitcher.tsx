import { useLocation, useNavigate } from 'react-router-dom'
import './OrganizationViewSwitcher.css'
import { getGroupSite } from '../../config/timebankCommunity'
import { useOrganizationAccess } from '../hooks/useOrganizationView'

export function OrganizationViewSwitcher({ organizationSlug, manager = false }: { organizationSlug?: string | null; manager?: boolean } = {}) {
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.match(/^\/orgs\/([^/]+)(?:\/(?:dashboard|public|member|organizer|attendee|volunteer))?\/?$/)
  const slug = organizationSlug || (match && !['login', 'register', 'profile', 'account', 'initiatives', 'events'].includes(match[1]) ? decodeURIComponent(match[1]) : getGroupSite()?.home_org_slug)
  const access = useOrganizationAccess(slug)
  if (!slug) return null
  const base = `/orgs/${encodeURIComponent(slug)}`
  const current = location.pathname.slice(base.length).split('/')[1]
  const selected = current === 'dashboard' ? (access.organizer || manager ? 'organizer' : 'member') : ['attendee', 'volunteer', 'member', 'organizer'].includes(current) ? current : 'public'
  return <label className="organization-view-picker">
    <span>View as</span>
    <select aria-label="View as" value={selected} onChange={event => navigate(`${base}/${event.target.value}`)}>
      <option value="public">Public</option>
      <option value="attendee">Attendee</option>
      <option value="volunteer">Volunteer</option>
      {(access.member || manager || import.meta.env.DEV) && <option value="member">Member</option>}
      {(access.organizer || manager || import.meta.env.DEV) && <option value="organizer">Organizer</option>}
    </select>
  </label>
}
