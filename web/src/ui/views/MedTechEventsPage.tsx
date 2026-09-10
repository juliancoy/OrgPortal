import { MEDTECH_LUMA_URL, MEDTECH_OWNED_EVENTS_PATH } from '../../config/medtechCommunity'
import { PublicEventsPage } from './public/PublicEventsPage'
import { MedTechFormationalEventCard } from './MedTechFormationalEventCard'

export function MedTechEventsPage() {
  return <>
    <nav aria-label="Event collections" className="medtech-event-collections">
      <span aria-current="page">MedTech Events</span>
      <a href="https://medtech.social/calendar.html">General Calendar ↗</a>
    </nav>
    <MedTechFormationalEventCard />
    <PublicEventsPage sourcePath={MEDTECH_OWNED_EVENTS_PATH} heading="MedTech Events"
      description="Events hosted by Baltimore MedTech. Browse the General Calendar for other medical and technology events around the region."
      emptyMessage="No upcoming MedTech-hosted events have been published in the portal yet." />
    <p className="muted">Looking for an event already on Luma? <a href={MEDTECH_LUMA_URL}>Open Baltimore MedTech on Luma ↗</a></p>
  </>
}
