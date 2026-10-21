import { OrganizationAvatar } from './OrganizationAvatar'
import { OrganizationEmailInvite } from './OrganizationEmailInvite'
import { useEffect, useId, useState } from 'react'
import { useAuth } from '../../app/AppProviders'
import type { NetworkUser } from '../views/peopleDirectory'

export function PortalPersonPicker({ query, selected, onQueryChange, onSelect, organizationId, onInvite, helpText }: {
  onInvite?: (email: string) => void; helpText?: string
  organizationId?: string; query: string; selected: { userId: string; name: string; email?: string } | null
  onQueryChange: (value: string) => void; onSelect: (person: NetworkUser) => void
}) {
  const { token } = useAuth()
  const id = useId()
  const [people, setPeople] = useState<NetworkUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setPeople([]); setError(''); setLoading(false)
    if (!token || selected || query.trim().length < 2) return
    const controller = new AbortController()
    setLoading(true)
    const timer = window.setTimeout(() => {
      void fetch(`/api/org/api/network/users?${new URLSearchParams({ q: query.trim(), limit: '40' })}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
      }).then(async response => {
        if (!response.ok) throw new Error('Could not search portal members.')
        const rows = await response.json() as NetworkUser[]
        if (!controller.signal.aborted) setPeople(query.includes('@')
          ? rows.filter(person => person.email?.trim().toLowerCase() === query.trim().toLowerCase()) : rows)
      }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, token, selected?.userId])
  return <div className="portal-person-picker">
    <label htmlFor={id}>Person’s email or portal member name</label>
    <input id={id} type="search" value={query} onChange={event => onQueryChange(event.target.value)}
      placeholder="Email address or existing member’s name" autoComplete="off" aria-describedby={`${id}-help`} />
    <p id={`${id}-help`} className="muted">{helpText || 'Choose the matching account before applying a status.'}</p>
    {selected ? <p>Selected: <strong>{selected.name || selected.userId}</strong>{selected.email ? ` · ${selected.email}` : ''}</p> : <>
      {loading && <p role="status">Searching portal members…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && query.trim().length >= 2 && !people.length && <p role="status">No existing portal member found.</p>}
      {onInvite && !loading && !error && !people.length && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.trim()) && <button type="button" className="btn-secondary" onClick={() => onInvite(query.trim().toLowerCase())}>Invite {query.trim().toLowerCase()} by email</button>}
      {organizationId && !loading && !error && !people.length && <OrganizationEmailInvite key={query} organizationId={organizationId} email={query} purpose="volunteer" />}
      {!!people.length && <ul className="organization-members-list" aria-label="Matching portal members">
        {people.map(person => <li key={person.user_id}><OrganizationAvatar name={person.user_name} src={person.photo_url} status={null} /><div><strong>{person.user_name}</strong><small className="muted" style={{ display: 'block', overflowWrap: 'anywhere' }}>{person.email || person.user_id}</small></div>
          <button type="button" className="btn-secondary" onClick={() => onSelect(person)} aria-label={`Choose ${person.user_name}`}>Choose</button>
        </li>)}
      </ul>}
    </>}
  </div>
}
