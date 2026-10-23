import { RegistrantAvatar } from './RegistrantAvatar'

type Presenter = { name: string; photo?: string; pending?: boolean }
export function SubmissionPresenters({ people }: { people: Presenter[] }) {
 if (!people.length) return <p className="muted submission-presenters-empty">No presenters selected.</p>
 const visible = people.slice(0, 5)
 return <section className="submission-presenters" aria-label="Presenters">
  <details>
   <summary className="public-event-attendance-button submission-presenter-summary">
    <span className="public-event-registrants" aria-hidden="true">
     {visible.map((person, index) => <span className="public-event-registrant" key={index}><RegistrantAvatar name={person.name} photoUrl={person.photo || null} /></span>)}
     {people.length > visible.length && <span className="public-event-registrant-more">+{people.length - visible.length}</span>}
    </span>
    <span className="public-event-attendance-count"><strong>{people.length} {people.length === 1 ? 'presenter' : 'presenters'}</strong><small>View presenters</small></span>
   </summary>
   <ul className="submission-presenter-list">{people.map((person, index) => <li key={index}>
    <RegistrantAvatar name={person.name} photoUrl={person.photo || null} />
    <span>{person.name}{person.pending && <small>Awaiting invitation acceptance</small>}</span>
   </li>)}</ul>
  </details>
 </section>
}
