import { useLayoutEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { applyPortalBranding } from '../../config/portalBranding'
import { getActivePortalProfileConfig } from '../../config/portalFeatures'
import { useDomainTenant } from '../../config/timebankCommunity'

export function PortalProfileBoundary() {
  const tenant = useDomainTenant()
  const profile = getActivePortalProfileConfig()

  useLayoutEffect(() => {
    applyPortalBranding()
  }, [profile.id, tenant])

  return <Outlet />
}
