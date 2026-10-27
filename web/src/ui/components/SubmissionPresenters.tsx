import { RegistrantAvatar } from './RegistrantAvatar'

type Presenter = { name: string; photo?: string; pending?: boolean }
export function SubmissionPresenters({ people }: { people: Presenter[] }) {
 if (!people.length) return null
 const visible = people.slice(0, 5)
 return <section className="submission-presenters" aria-label="Team members">
  <details>
   <summary className="public-event-attendance-button submission-presenter-summary" aria-label="View team members" title="View team members">
    <span className="public-event-registrants" aria-hidden="true">
     {visible.map((person, index) => <span className="public-event-registrant" key={index}><RegistrantAvatar name={person.name} photoUrl={person.photo || null} /></span>)}
     {people.length > visible.length && <span className="public-event-registrant-more">+{people.length - visible.length}</span>}
    </span>
   </summary>
   <ul className="submission-presenter-list">{people.map((person, index) => <li key={index}>
    <RegistrantAvatar name={person.name} photoUrl={person.photo || null} />
    <span>{person.name}{person.pending && <small>Awaiting invitation acceptance</small>}</span>
   </li>)}</ul>
  </details>
 </section>
}
