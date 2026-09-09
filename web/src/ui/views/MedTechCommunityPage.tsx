import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { portalPath } from '../../config/portalBase'
import { portalProfilePath } from '../../config/portalFeatures'
import { MEDTECH_CHAT_URL, MEDTECH_OWNED_EVENTS_PATH, MEDTECH_LUMA_URL, medTechEventImageUrl, selectOwnedMedTechEvents, type MedTechEvent } from '../../config/medtechCommunity'

export function MedTechCommunityPage() {
  const { user } = useAuth()
  const [events, setEvents] = useState<MedTechEvent[]>([])
  const [status, setStatus] = useState('Loading upcoming events…')

  useEffect(() => {
    document.title = 'Community • Baltimore MedTech'
    const controller = new AbortController()
    fetch(`/api/org${MEDTECH_OWNED_EVENTS_PATH}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load events.')
        const upcoming = selectOwnedMedTechEvents(await response.json())
        setEvents(upcoming)
        setStatus(upcoming.length ? '' : 'No upcoming MedTech-hosted events have been published in the portal yet.')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('MedTech events could not be loaded. Please try again later, or check the group’s Luma page.')
      })
    return () => controller.abort()
  }, [])

  return (
    <div className="medtech-community">
      <section className="medtech-community-hero" aria-labelledby="medtech-community-title">
        <img className="medtech-community-backdrop" src={portalPath('/images/baltimore-medtech-hero.webp')} alt="" />
        <div>
          <p className="medtech-eyebrow">Health × Medicine × Biotech</p>
          <h1 id="medtech-community-title">Your Baltimore<br />MedTech community.</h1>
          <p>Welcome, {user?.firstName || user?.displayName || 'neighbor'}. Find your next conversation, connection, or local event.</p>
          <a className="medtech-primary-link" href={MEDTECH_CHAT_URL}>Join the community conversation <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <section className="medtech-community-grid" aria-label="Connect with the community">
        <article className="medtech-community-card">
          <p className="medtech-eyebrow">Meet people</p>
          <h2>Make a connection.</h2>
          <p>Find health, medicine, and biotech people and organizations in the shared directory.</p>
          <Link to={portalProfilePath('/search?q=medtech&scope=people')}>Find MedTech people <span aria-hidden="true">→</span></Link>
          <Link to={portalProfilePath('/people')}>Browse the full directory</Link>
        </article>
        <article className="medtech-community-card">
          <p className="medtech-eyebrow">Keep talking</p>
          <h2>Bring your perspective.</h2>
          <p>Meet the group in our Baltimore MedTech WhatsApp chat, or continue a direct conversation in the portal.</p>
          <a href={MEDTECH_CHAT_URL}>Open the MedTech group <span aria-hidden="true">↗</span></a>
          <Link to={portalProfilePath('/chat')}>Open your messages</Link>
        </article>
      </section>

      <section className="medtech-community-events" aria-labelledby="medtech-events-title">
        <div className="medtech-section-heading">
          <div><p className="medtech-eyebrow">Hosted by our group</p><h2 id="medtech-events-title">MedTech Events</h2></div>
          <Link to={portalProfilePath('/medtech-events')}>All MedTech events <span aria-hidden="true">→</span></Link>
        </div>
        {status && <p role="status">{status}</p>}
        <ul className="medtech-event-list">
          {events.map(event => {
            const imageUrl = medTechEventImageUrl(event)
            return <li key={`${event.url}-${event.startDate}`}>
            <div className="medtech-event-details">
            <time dateTime={event.startDate}>{new Date(event.startDate).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</time>
            <Link to={portalProfilePath(event.url)}>{event.name} <span aria-hidden="true">→</span></Link>
            {event.location?.name && <span>{event.location.name}</span>}
            </div>
            {imageUrl && <img className="medtech-event-image" src={imageUrl} alt="" loading="lazy" decoding="async" onError={event => { event.currentTarget.hidden = true }} />}
          </li>})}
        </ul>
        <p><a href={MEDTECH_LUMA_URL}>Baltimore MedTech on Luma ↗</a></p>
      </section>
      <section className="medtech-community-card" aria-labelledby="regional-calendar-title">
        <p className="medtech-eyebrow">Around the region</p>
        <h2 id="regional-calendar-title">General Calendar</h2>
        <p>Discover medical, health and technology events from organizations across Baltimore.</p>
        <a href="https://medtech.social/calendar.html">Browse the General Calendar ↗</a>
      </section>
    </div>
  )
}
