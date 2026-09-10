import { useLayoutEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { applyPortalBranding } from '../../config/portalBranding'
import { getActivePortalProfileConfig } from '../../config/portalFeatures'
import { useDomainCommunity } from '../../config/timebankCommunity'

export function PortalProfileBoundary() {
  const community = useDomainCommunity()
  const profile = getActivePortalProfileConfig()

  useLayoutEffect(() => {
    applyPortalBranding()
  }, [profile.id, community])

  return <Outlet />
}
