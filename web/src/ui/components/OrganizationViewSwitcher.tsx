import { Link, useLocation } from 'react-router-dom'
import { getGroupSite } from '../../config/timebankCommunity'
import { useOrganizationAccess } from '../hooks/useOrganizationView'

export function OrganizationViewSwitcher({ organizationSlug, manager = false }: { organizationSlug?: string | null; manager?: boolean } = {}) {
  const location = useLocation()
  const match = location.pathname.match(/^\/orgs\/([^/]+)(?:\/(?:dashboard|public|member|organizer|attendee|volunteer))?\/?$/)
  const slug = organizationSlug || (match && !['login', 'register', 'profile', 'account', 'initiatives', 'events'].includes(match[1]) ? decodeURIComponent(match[1]) : getGroupSite()?.home_org_slug)
  const access = useOrganizationAccess(slug)
  if (!slug) return null
  const base = `/orgs/${encodeURIComponent(slug)}`
  return <nav aria-label="Organization views" className="organization-view-links">
    <span>Organization pages</span>
    <Link to={`${base}/public`}>Public page</Link>
    <Link to={`${base}/attendee`}>Attendee page</Link>
    <Link to={`${base}/volunteer`}>Volunteer page</Link>
    {(access.member || manager || import.meta.env.DEV) && <Link to={`${base}/member`}>Member page</Link>}
    {(access.organizer || manager || import.meta.env.DEV) && <Link to={`${base}/organizer`}>Organizer page</Link>}
  </nav>
}
