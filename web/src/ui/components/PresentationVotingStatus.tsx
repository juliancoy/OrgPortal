import { Link, useLocation } from 'react-router-dom'

export function PresentationVotingStatus({closesAt,closed,signedIn}:{closesAt:string|null;closed:boolean;signedIn:boolean}) {
 const location=useLocation()
 return <div className="presentation-voting-status">
  {closesAt&&<p>{closed?'Voting is closed. Scheduled deadline:':'Voting closes'} <time dateTime={closesAt}>{new Date(closesAt).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}</time> — one week after the event ends.</p>}
  {!closed&&!signedIn&&<Link className="btn-primary" to={`/users/login?next=${encodeURIComponent(location.pathname+location.search+location.hash)}`}>Sign in to vote</Link>}
 </div>
}
