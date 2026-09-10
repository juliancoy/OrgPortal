import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { portalPath } from '../../config/portalBase'
import { getActivePortalProfileConfig, portalProfilePath } from '../../config/portalFeatures'
import { getDomainTenant, type PortalTenant } from '../../config/timebankCommunity'
import { Header } from '../shell/Header'
import { Footer } from '../shell/Footer'
import { ExternalBrowserPrompt } from '../components/ExternalBrowserPrompt'
import { PublicEventsPage } from './public/PublicEventsPage'

type TenantEvent = {
  id: string
  title: string
  slug: string
  starts_at?: string | null
  location?: string | null
  image_url?: string | null
}

function safeExternalHref(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw, window.location.origin)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    return url.href
  } catch {
    return ''
  }
}

function actionHref(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('/')) return portalProfilePath(raw)
  return safeExternalHref(raw)
}

function actionLinkTarget(href: string) {
  const url = new URL(href, window.location.origin)
  if (url.origin !== window.location.origin && !href.startsWith('/')) return null
  return `${url.pathname}${url.search}${url.hash}`
}

function formatEventDate(value?: string | null) {
  if (!value) return 'Date to be announced'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date to be announced'
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function featureLabel(feature: string) {
  if (feature === 'timebank') return 'Timebank'
  if (feature === 'directory') return 'Directory'
  if (feature === 'events') return 'Events'
  if (feature === 'chat') return 'Messages'
  if (feature === 'ubi') return 'Civic finance'
  return feature.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function TenantHomeActions({ tenant }: { tenant: PortalTenant }) {
  const { role } = useAuth()
  const primaryHref = actionHref(tenant.home_primary_href) || portalProfilePath(role === 'guest' ? '/users/register' : '/chat')
  const secondaryHref = actionHref(tenant.home_secondary_href) || (tenant.home_org_slug ? portalProfilePath(`/orgs/${encodeURIComponent(tenant.home_org_slug)}`) : portalProfilePath('/events'))
  const primaryLabel = tenant.home_primary_label || (role === 'guest' ? 'Join the Community' : 'Open Messages')
  const secondaryLabel = tenant.home_secondary_label || (tenant.home_org_slug ? 'View Organization' : 'Browse Events')
  const primaryTarget = actionLinkTarget(primaryHref)
  const secondaryTarget = actionLinkTarget(secondaryHref)

  return <div className="tenant-home-actions">
    {primaryTarget ? <Link className="btn-primary" to={primaryTarget}>{primaryLabel}</Link> : <a className="btn-primary" href={primaryHref}>{primaryLabel}</a>}
    {secondaryTarget ? <Link className="portal-button-secondary" to={secondaryTarget}>{secondaryLabel}</Link> : <a className="portal-button-secondary" href={secondaryHref}>{secondaryLabel}</a>}
  </div>
}

export function TenantHomePage() {
  const profile = getActivePortalProfileConfig()
  const tenant = getDomainTenant()
  const [events, setEvents] = useState<TenantEvent[]>([])
  const [eventStatus, setEventStatus] = useState('')
  const features = useMemo(() => (tenant?.features || []).filter((feature) => feature !== 'ubi'), [tenant])

  useEffect(() => {
    document.title = `${profile.brandName} Portal`
  }, [profile.brandName])

  useEffect(() => {
    if (!tenant?.home_org_slug) return
    const controller = new AbortController()
    setEventStatus('Loading upcoming events...')
    fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(tenant.home_org_slug)}/events?upcoming_only=true&limit=3`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load events.')
        const data = await response.json()
        setEvents(Array.isArray(data) ? data : [])
        setEventStatus('')
      })
      .catch(() => {
        if (!controller.signal.aborted) setEventStatus('Upcoming events are not available right now.')
      })
    return () => controller.abort()
  }, [tenant?.home_org_slug])

  if (!tenant) return null
  const imageUrl = tenant.home_image_url || profile.brandImagePath

  return <div className="portal-shell tenant-home-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <Header />
    <main id="main-content" className="portal-main tenant-home-main" tabIndex={-1}>
      <div className="portal-container">
        <ExternalBrowserPrompt />
        <section className="tenant-home-hero" aria-labelledby="tenant-home-title">
          <div className="tenant-home-copy">
            <p className="tenant-home-eyebrow">{profile.tagline}</p>
            <h1 id="tenant-home-title">{tenant.home_heading || profile.brandName}</h1>
            <p>{tenant.home_description || `Welcome to the ${profile.brandName} portal.`}</p>
            <TenantHomeActions tenant={tenant} />
          </div>
          {imageUrl && <div className="tenant-home-media">
            <img src={imageUrl.startsWith('/') ? portalPath(imageUrl) : imageUrl} alt="" />
          </div>}
        </section>

        {features.length > 0 && <section className="tenant-home-grid" aria-label={`${profile.brandName} portal sections`}>
          {features.slice(0, 4).map((feature) => <article className="tenant-home-card" key={feature}>
            <span>{featureLabel(feature)}</span>
            <h2>{feature === 'events' ? 'Events and registration' : feature === 'chat' ? 'Community messages' : featureLabel(feature)}</h2>
            <p>{feature === 'events' ? 'Publish events, collect registrations, and keep attendance visible.' : feature === 'chat' ? 'Keep member conversations close to the organization.' : `Use the ${featureLabel(feature).toLowerCase()} tools configured for this tenant.`}</p>
          </article>)}
        </section>}

        {tenant.home_org_slug && <section className="tenant-home-events" aria-labelledby="tenant-home-events-title">
          <div className="tenant-home-section-heading">
            <div>
              <p className="tenant-home-eyebrow">Upcoming</p>
              <h2 id="tenant-home-events-title">Hosted Events</h2>
            </div>
            <Link to={portalProfilePath(`/orgs/${encodeURIComponent(tenant.home_org_slug)}`)}>Organization Profile</Link>
          </div>
          {eventStatus && <p role="status" className="muted">{eventStatus}</p>}
          <div className="tenant-home-event-list">
            {events.map((event) => <Link className="tenant-home-event" to={portalProfilePath(`/events/${encodeURIComponent(event.slug)}`)} key={event.id}>
              {event.image_url && <img src={event.image_url} alt="" loading="lazy" decoding="async" />}
              <span>{formatEventDate(event.starts_at)}</span>
              <strong>{event.title}</strong>
              {event.location && <small>{event.location}</small>}
            </Link>)}
          </div>
        </section>}
      </div>
    </main>
    <Footer />
  </div>
}

export function TenantEventsHomePage() {
  const profile = getActivePortalProfileConfig()
  const tenant = getDomainTenant()
  const orgSlug = tenant?.home_org_slug || ''

  if (!tenant || !orgSlug) return <TenantHomePage />

  return <div className="portal-shell tenant-home-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <Header />
    <main id="main-content" className="portal-main" tabIndex={-1}>
      <div className="portal-container">
        <ExternalBrowserPrompt />
        <PublicEventsPage
          sourcePath={`/api/network/orgs/public/${encodeURIComponent(orgSlug)}/events?upcoming_only=true&limit=120`}
          heading={`${profile.brandName} Events`}
          description={`Upcoming events hosted by ${profile.brandName}.`}
          emptyMessage="No upcoming events have been published yet."
        />
      </div>
    </main>
    <Footer />
  </div>
}
