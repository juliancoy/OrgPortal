import { NavigationProgress } from '../components/RouteLoading'
import { useLayoutEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { applyPortalBranding } from '../../config/portalBranding'
import { getActivePortalProfileConfig } from '../../config/portalFeatures'
import { useGroupSite } from '../../config/timebankCommunity'

export function PortalProfileBoundary() {
  const tenant = useGroupSite()
  const profile = getActivePortalProfileConfig()

  useLayoutEffect(() => {
    applyPortalBranding()
  }, [profile.id, tenant])

  return <><NavigationProgress /><Outlet /></>
}
