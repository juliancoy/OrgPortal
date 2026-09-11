import { Link } from 'react-router-dom'
import { getActivePortalProfileConfig } from '../../config/portalFeatures'
import { useDomainTenant } from '../../config/timebankCommunity'

const MEDTECH_WHATSAPP_URL = 'https://chat.whatsapp.com/Fpsd3Ko6l7q0Fy8DEYxw8V'
const MEDTECH_GITHUB_URL = 'https://github.com/juliancoy/BmoreMedTech'
const MEDTECH_LUMA_URL = 'https://luma.com/'

function CalendarIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1.25A2.75 2.75 0 0 1 22 6.75v11.5A2.75 2.75 0 0 1 19.25 21H4.75A2.75 2.75 0 0 1 2 18.25V6.75A2.75 2.75 0 0 1 4.75 4H6V3a1 1 0 0 1 1-1Zm13 8H4v8.25c0 .41.34.75.75.75h14.5c.41 0 .75-.34.75-.75V10ZM4.75 6a.75.75 0 0 0-.75.75V8h16V6.75a.75.75 0 0 0-.75-.75H18v1a1 1 0 1 1-2 0V6H8v1a1 1 0 0 1-2 0V6H4.75Z" /></svg>
}

function GithubIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.39 7.86 10.92.58.11.79-.25.79-.56v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18A10.98 10.98 0 0 1 12 6.04c.98 0 1.96.13 2.88.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.27 5.68.42.36.79 1.07.79 2.16v3.14c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" /></svg>
}

function WhatsAppIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.52 3.49A11.79 11.79 0 0 0 12.13 0C5.63 0 .34 5.29.34 11.79c0 2.08.54 4.11 1.58 5.9L.25 23.79l6.25-1.64a11.76 11.76 0 0 0 5.63 1.43h.01c6.5 0 11.79-5.29 11.79-11.79 0-3.15-1.23-6.11-3.41-8.3ZM12.14 21.6h-.01a9.79 9.79 0 0 1-4.99-1.37l-.36-.21-3.71.97.99-3.62-.23-.37a9.8 9.8 0 0 1-1.5-5.21c0-5.41 4.4-9.81 9.82-9.81 2.62 0 5.09 1.02 6.94 2.88a9.77 9.77 0 0 1 2.87 6.94c-.01 5.4-4.41 9.8-9.82 9.8Zm5.38-7.35c-.29-.15-1.74-.86-2.01-.95-.27-.1-.46-.15-.66.15-.19.29-.76.95-.93 1.14-.17.2-.34.22-.63.07-.29-.15-1.24-.46-2.36-1.46a8.87 8.87 0 0 1-1.63-2.03c-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.19-.29.29-.49.1-.2.05-.37-.02-.52-.07-.15-.66-1.59-.9-2.18-.24-.57-.48-.49-.66-.5h-.56c-.19 0-.51.07-.78.37-.27.29-1.03 1-1.03 2.45 0 1.44 1.05 2.84 1.2 3.03.15.2 2.07 3.16 5.01 4.43.7.3 1.25.48 1.68.61.7.22 1.34.19 1.85.12.56-.08 1.74-.71 1.98-1.39.24-.68.24-1.27.17-1.39-.07-.12-.27-.19-.56-.34Z" /></svg>
}

function LumaIcon() {
  return <span aria-hidden="true" className="floating-social-luma">Lu</span>
}

function isMedTechProfile() {
  const profile = getActivePortalProfileConfig()
  return profile.id === 'baltimore-medtech' || profile.tenantId === 'baltimore-medtech' || (typeof window !== 'undefined' && window.location.hostname.endsWith('medtech.social'))
}

function externalUrlFromFeatureConfig(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

export function FloatingSocialDock() {
  const tenant = useDomainTenant()
  if (!isMedTechProfile()) return null

  const githubUrl = externalUrlFromFeatureConfig(tenant?.feature_config?.githubUrl) || MEDTECH_GITHUB_URL
  const whatsappUrl = externalUrlFromFeatureConfig(tenant?.feature_config?.whatsappUrl) || MEDTECH_WHATSAPP_URL
  const lumaUrl = externalUrlFromFeatureConfig(tenant?.feature_config?.lumaUrl) || MEDTECH_LUMA_URL

  return <nav className="floating-social-dock" aria-label="Baltimore MedTech social links">
    <Link className="floating-social-link calendar" to="/calendar" aria-label="Open Baltimore MedTech calendar" title="Calendar"><CalendarIcon /></Link>
    <a className="floating-social-link whatsapp" href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Join Baltimore MedTech on WhatsApp" title="WhatsApp"><WhatsAppIcon /></a>
    <a className="floating-social-link github" href={githubUrl} target="_blank" rel="noopener noreferrer" aria-label="View Baltimore MedTech on GitHub" title="GitHub"><GithubIcon /></a>
    <a className="floating-social-link luma" href={lumaUrl} target="_blank" rel="noopener noreferrer" aria-label="Open Baltimore MedTech on Luma" title="Luma"><LumaIcon /></a>
  </nav>
}
