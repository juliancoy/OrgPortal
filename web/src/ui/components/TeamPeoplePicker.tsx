import { useState } from 'react'
import { PortalPersonPicker } from './PortalPersonPicker'
import { OrganizationAvatar } from './OrganizationAvatar'

export type TeamPerson = { userId?: string; name: string; email?: string; photo?: string; invitationId?: string; existing?: boolean }
export function readTeamPeople(value: string): TeamPerson[] {
 try {
  const rows: unknown = JSON.parse(value)
  if (!Array.isArray(rows) || rows.length > 50) return []
  return rows.filter((row): row is TeamPerson => !!row && typeof row === 'object'
   && typeof row.name === 'string' && row.name.length <= 255
   && (row.userId === undefined || (typeof row.userId === 'string' && row.userId.length <= 255))
   && (row.email === undefined || (typeof row.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)))
   && (row.photo === undefined || (typeof row.photo === 'string' && /^https?:\/\//.test(row.photo)))
   && (row.invitationId === undefined || (typeof row.invitationId === 'string' && row.invitationId.length <= 255))
   && !!(row.userId || row.email))
 } catch { return [] }
}
export function TeamPeoplePicker({ people, onChange, compact=false }: { people: TeamPerson[]; onChange: (people: TeamPerson[]) => void; compact?: boolean }) {
 const [query, setQuery] = useState('')
 function add(person: TeamPerson) {
  if (!people.some(existing => (person.userId && existing.userId === person.userId) || (person.email && existing.email?.toLowerCase() === person.email.toLowerCase()))) onChange([...people, person])
  setQuery('')
 }
 return <fieldset className="team-people-picker"><legend className={compact?'sr-only':undefined}>{compact?'Teammates':'Team members'}</legend>
  {!compact && <p className="muted">Add portal members by name or email. New email addresses receive an invitation when you submit; they must verify their email and accept before joining.</p>}
  {people.length < 50 && <PortalPersonPicker query={query} selected={null} onQueryChange={setQuery}
   label={compact ? "Team members" : undefined}
   helpText={compact ? "" : "Choose a portal member or add an email invitation to your team."}
   onSelect={person => add({ userId: person.user_id, name: person.user_name, ...(person.email ? {email: person.email} : {}), ...(person.photo_url ? {photo: person.photo_url} : {}) })}
   onInvite={email => add({name: email, email})} />}
  <ul className="team-people-list" aria-label="Selected team members">{people.map((person, index) => <li key={person.userId || person.email}>
   <OrganizationAvatar name={person.name} src={person.photo} status={null} />
   <div><strong>{person.name}</strong><small className="muted">{person.userId ? (person.existing ? 'Team member' : 'Portal member · will be added') : 'Email invitation · pending acceptance'}{person.userId && person.email ? ` · ${person.email}` : ''}</small></div>
   {!person.existing && <button type="button" className="btn-secondary" aria-label={`Remove ${person.name}`} onClick={() => onChange(people.filter((_, i) => i !== index))}>Remove</button>}
  </li>)}</ul>
 </fieldset>
}
