import { useLayoutEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { applyPortalBranding } from '../../config/portalBranding'
import { getActivePortalProfileConfig, portalProfilePath } from '../../config/portalFeatures'
import { useDomainCommunity } from '../../config/timebankCommunity'

export function PortalProfileBoundary() {
  const location = useLocation()
  const community = useDomainCommunity()
  const profile = getActivePortalProfileConfig(location.search)
  const current = `${location.pathname}${location.search}${location.hash}`
  const branded = portalProfilePath(current, profile)

  useLayoutEffect(() => {
    applyPortalBranding()
  }, [profile.id, community])

  // Keep copied URLs and reloads self-contained, including when storage is blocked.
  return branded === current ? <Outlet /> : <Navigate to={branded} replace />
}
