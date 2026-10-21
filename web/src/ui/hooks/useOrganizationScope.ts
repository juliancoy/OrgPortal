import { useLocation } from 'react-router-dom'
import { getGroupSite } from '../../config/timebankCommunity'

export function useOrganizationScope() {
  const location = useLocation()
  const match = location.pathname.match(/^\/orgs\/([^/]+)(?:\/dashboard)?\/?$/)
  const reserved = ['initiatives', 'events', 'login', 'register', 'profile', 'account']
  const route = match && !reserved.includes(match[1]) ? decodeURIComponent(match[1]) : null
  return route || new URLSearchParams(location.search).get('org') || getGroupSite()?.home_org_slug || null
}
