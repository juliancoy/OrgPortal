import { portalAssetPath } from './portalBase'
import { getActivePortalProfileConfig } from './portalFeatures'

export function applyPortalBranding() {
  const profile = getActivePortalProfileConfig()
  document.title = profile.portalTitle
  document.documentElement.dataset.portalProfile = profile.id
  if (profile.tenantId) document.documentElement.dataset.portalTenant = profile.tenantId
  else delete document.documentElement.dataset.portalTenant
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (icon) {
    icon.href = portalAssetPath(profile.faviconPath)
    icon.type = profile.faviconType
  }
  const appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
  if (appleIcon) appleIcon.href = portalAssetPath(profile.appleTouchIconPath)
  let manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (!manifest) {
    manifest = document.createElement('link')
    manifest.rel = 'manifest'
    document.head.appendChild(manifest)
  }
  manifest.href = portalAssetPath(profile.manifestPath)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', profile.themeColor)
}
