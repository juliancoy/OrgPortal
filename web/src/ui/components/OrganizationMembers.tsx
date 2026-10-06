import './OrganizationMembers.css'
import { useEffect, useId, useState } from 'react'
import { useAuth } from '../../app/AppProviders'
import { toUserFacingErrorMessage } from '../../infrastructure/http/userFacingError'
import { uniqueAccounts } from './organizationMemberSearch'
import type { NetworkUser } from '../views/peopleDirectory'

type Member = { user_id: string; user_name?: string | null; role: string; user_email?: string | null; pending_organizer?: number; onboarding_completed_at?: string | null }

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json()
  if (!response.ok) throw new Error(data.detail || data.error || `Request failed (${response.status})`)
  return data as T
}

export function OrganizationMembers({ organizationId, name, canRead, canManage, membershipCount }: {
  organizationId: string; name: string; canRead: boolean; canManage: boolean; membershipCount: number
}) {
  const { token } = useAuth()
  const searchId = useId()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<NetworkUser[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState<{ previewId: string; person: NetworkUser; role: 'member' | 'administrator'; assignment?: { pending_organizer: number } | null } | null>(null)
  const [revision, setRevision] = useState(0)
  const url = `/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/members`

  useEffect(() => { setPreview(null); setQuery(''); setStatus('') }, [organizationId, token])

  useEffect(() => {
    setMembers([]); setError('')
    if (!token || !canRead) return
    const controller = new AbortController()
    setLoading(true)
    void fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(readResponse<Member[]>).then(rows => { if (!controller.signal.aborted) setMembers(uniqueAccounts(rows)) })
      .catch(err => { if (!controller.signal.aborted) setError(toUserFacingErrorMessage(err, 'Could not load community members.')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [url, token, canRead, membershipCount, revision])

  useEffect(() => {
    setPeople([]); setSearchError(''); setSearching(false)
    if (!token || !canManage || !query.trim()) return
    const controller = new AbortController()
    setSearching(true)
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim(), limit: '40' })
      void fetch(`/api/org/api/network/users?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
        .then(readResponse<NetworkUser[]>).then(rows => { if (!controller.signal.aborted) setPeople(uniqueAccounts(rows)) })
        .catch(err => { if (!controller.signal.aborted) setSearchError(toUserFacingErrorMessage(err, 'Could not search people.')) })
        .finally(() => { if (!controller.signal.aborted) setSearching(false) })
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [query, token, canManage])

  async function assignMember(person: NetworkUser, role: 'member' | 'administrator', confirm = false) {
    if (!token || !canManage || adding) return
    setAdding(person.user_id); setSearchError(''); setStatus('')
    const payload = { user_id: person.user_id, user_name: person.user_name || undefined, role,
      ...(role === 'member' ? { add_only: true } : {}),
      ...(confirm && preview ? { previewId: preview.previewId } : {}) }
    try {
      const data = await readResponse<{ previewId: string; result?: Member; assignment?: { pending_organizer: number } | null }>(await fetch(`${url}/${confirm ? 'apply' : 'preview'}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }))
      if (!confirm) setPreview({ previewId: data.previewId, person, role, assignment: data.assignment })
      else {
        setPreview(null); setRevision(value => value + 1)
        setStatus(data.result?.pending_organizer ? `${person.user_name} is an organizer pending onboarding.` : `${person.user_name} assigned as ${role === 'administrator' ? 'an organizer' : 'a member'}.`)
      }
    } catch (err) { setPreview(null); setSearchError(toUserFacingErrorMessage(err, 'Could not update membership.')) }
    finally { setAdding(null) }
  }

  return <section className="portal-card organization-members" aria-label="Community members">
    <h2>Community members <span className="muted">({canRead && !loading && !error ? members.length : membershipCount})</span></h2>
    {!canRead ? <p className="muted">{token ? `Join ${name} to see community members.` : 'Sign in to see community members.'}</p> : <>
      {loading && <p role="status">Loading members…</p>}
      {error && <p role="alert">{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Retry</button></p>}
      {!loading && !error && (members.length ? <ul className="organization-members-list">
        {members.map(member => <li key={member.user_id}>
          <div>{member.user_name || 'Community member'}<small className="muted" style={{ display: 'block', overflowWrap: 'anywhere' }}>{member.user_email || member.user_id}</small></div>
          <span className="pill">{member.pending_organizer ? (member.onboarding_completed_at ? 'Organizer ready for activation' : 'Organizer pending onboarding') : member.role === 'administrator' ? 'Organizer' : member.role === 'owner' ? 'Owner' : 'Member'}</span>
          {canManage && member.role === 'member' && (!member.pending_organizer || member.onboarding_completed_at) && <button type="button" disabled={!!adding || !!preview} onClick={() => void assignMember({ user_id: member.user_id, user_name: member.user_name || 'Community member' } as NetworkUser, 'administrator')}>{member.pending_organizer ? 'Activate organizer' : 'Assign organizer'}</button>}
        </li>)}
      </ul> : <p className="muted">No community members yet.</p>)}
    </>}
    {canManage && <div className="organization-member-search">
      <label htmlFor={searchId}>Search people to add</label>
      <input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name" />
      {searching && <p role="status">Searching people…</p>}
      {searchError && <p role="alert">{searchError}</p>}
      {query.trim() && !searching && !searchError && !people.length && <p className="muted">No people match “{query.trim()}”.</p>}
      {!!people.length && <ul className="organization-members-list" aria-label="People search results">
        {people.map(person => {
          const alreadyMember = members.some(member => member.user_id === person.user_id)
          return <li key={person.user_id}>
            <div><strong>{person.user_name}</strong><small className="muted" style={{ display: 'block', overflowWrap: 'anywhere' }}>{person.email ? `${person.email} · ` : ''}Account: {person.user_id}</small>{person.headline && <p className="muted">{person.headline}</p>}</div>
            {alreadyMember ? <span className="pill">Already a member</span> : <button type="button" className="btn-secondary" disabled={!!adding || !!preview || loading || !!error} onClick={() => void assignMember(person, 'member')} aria-label={`Add ${person.user_name}`}>
              {adding === person.user_id ? 'Adding…' : 'Add'}
            </button>}
            {!members.some(member => member.user_id === person.user_id && (member.role !== 'member' || member.pending_organizer)) && <button type="button" disabled={!!adding || !!preview || loading || !!error} onClick={() => void assignMember(person, 'administrator')}>Assign organizer</button>}
          </li>
        })}
      </ul>}
      {preview && <div role="region" aria-label="Review membership assignment">
        <h3>Review assignment</h3>
        <p>{preview.person.user_name} · Account: {preview.person.user_id}</p>
        <p>{preview.role === 'member' ? 'Add as a member. Existing roles are retained.' : preview.assignment?.pending_organizer ? 'Organizer pending onboarding. Member permissions remain until onboarding is complete and an organizer activates the role.' : 'Activate organizer permissions.'}</p>
        <button type="button" disabled={!!adding} onClick={() => void assignMember(preview.person, preview.role, true)}>Confirm assignment</button>
        <button type="button" disabled={!!adding} onClick={() => setPreview(null)}>Cancel</button>
      </div>}
      {status && <p role="status">{status}</p>}
    </div>}
  </section>
}
