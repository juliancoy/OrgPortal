import { portalPath } from './portalBase'
import { getActivePortalProfileConfig } from './portalFeatures'

export function applyPortalBranding() {
  const profile = getActivePortalProfileConfig()
  const medtech = profile.id === 'baltimore-medtech'
  document.documentElement.dataset.portalProfile = profile.id
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (icon) {
    icon.href = portalPath(medtech ? '/images/baltimore-medtech-logo-square.jpg' : '/codecollective_logo.png')
    icon.type = medtech ? 'image/jpeg' : 'image/png'
  }
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (manifest) manifest.href = portalPath(medtech ? '/medtech.webmanifest' : '/manifest.webmanifest')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', medtech ? '#061a26' : '#12325b')
}
