import { Link, useLocation } from 'react-router-dom'
import { getGroupSite } from '../../config/timebankCommunity'

/** Explicit navigation to tools; never changes the public landing-page appearance. */
export function OrganizationWorkspaceLink({ organizationSlug }: { organizationSlug?: string | null } = {}) {
  const location = useLocation()
  const match = location.pathname.match(/^\/orgs\/([^/]+)(?:\/dashboard)?\/?$/)
  const slug = organizationSlug || (match && !['login', 'register', 'profile', 'account', 'initiatives', 'events'].includes(match[1]) ? decodeURIComponent(match[1]) : getGroupSite()?.home_org_slug)
  return slug ? <Link to={`/orgs/${encodeURIComponent(slug)}/dashboard`}>Organization workspace</Link> : null
}
