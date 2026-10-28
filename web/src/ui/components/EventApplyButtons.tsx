import Send from 'lucide-react/dist/esm/icons/send.mjs'
import UserRound from 'lucide-react/dist/esm/icons/user-round.mjs'
import { Link } from 'react-router-dom'
import '../views/public/event-application.css'

export function EventApplyButtons({eventSlug,gold}:{eventId:string;eventSlug:string;gold:string}) {
 return <div className="event-apply-actions" role="group" aria-label="Presentation application options">
  <div className="event-apply-option"><Link className="btn-primary event-apply-link" style={{background:gold,color:'#17201c',borderColor:gold}} to={`/events/${encodeURIComponent(eventSlug)}/apply`}><UserRound size={18} aria-hidden="true" /> Apply with an organization</Link></div>
  <div className="event-apply-option"><Link className="btn-secondary event-apply-link" style={{borderColor:gold}} to={`/events/${encodeURIComponent(eventSlug)}/apply/guest`}><Send size={18} aria-hidden="true" /> Apply as a guest</Link></div>
 </div>
}
