import { Link } from 'react-router-dom'
import { MEDTECH_FORMATIONAL_EVENT } from '../../config/medtechCommunity'
import { portalProfilePath } from '../../config/portalFeatures'

const dateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: MEDTECH_FORMATIONAL_EVENT.timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('en-US', { timeZone: MEDTECH_FORMATIONAL_EVENT.timezone, hour: 'numeric', minute: '2-digit' })

export function MedTechFormationalEventCard() {
  const start = new Date(MEDTECH_FORMATIONAL_EVENT.plannedStart)
  const end = new Date(MEDTECH_FORMATIONAL_EVENT.plannedEnd)
  return <article className="medtech-formational-event" aria-labelledby="medtech-formational-event-title">
    <div className="medtech-formational-event-copy">
      <p className="medtech-eyebrow">Featured event</p>
      <h2 id="medtech-formational-event-title">{MEDTECH_FORMATIONAL_EVENT.name}</h2>
      <p className="medtech-formational-event-date"><time dateTime={MEDTECH_FORMATIONAL_EVENT.plannedStart}>{dateFormatter.format(start)}</time><span aria-hidden="true"> · </span><span>{timeFormatter.format(start)}–{timeFormatter.format(end)} Eastern</span></p>
      <p>A gathering to shape Baltimore’s medicine-and-technology community and its next season of work.</p>
      <p className="medtech-formational-event-note">Registration will be handled here in the Org Portal.</p>
    </div>
    <div className="medtech-formational-event-actions">
      <Link className="medtech-primary-link" to={portalProfilePath(MEDTECH_FORMATIONAL_EVENT.eventPath)}>Open MedTech events <span aria-hidden="true">→</span></Link>
      <Link to={portalProfilePath('/medtech-events')}>Browse MedTech events <span aria-hidden="true">→</span></Link>
    </div>
  </article>
}
