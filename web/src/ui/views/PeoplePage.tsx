import { OrganizationAvatar, OrganizationPersonnelLegend } from '../components/OrganizationAvatar'
import { useOrganizationPersonnel } from '../hooks/useOrganizationPersonnel'
import { useOrganizationScope } from '../hooks/useOrganizationScope'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { setSeoMeta } from '../utils/seo'
import { getActivePortalProfileConfig } from '../../config/portalFeatures'
import { loadPeopleDirectory, type NetworkUser } from './peopleDirectory'

const ORG_API_BASE = '/api/org'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

export function PeoplePage() {
  const organizationScope = useOrganizationScope()
  const personnelFor = useOrganizationPersonnel(organizationScope)
  const portalProfile = getActivePortalProfileConfig()
  const { token, user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminView, setAdminView] = useState(false)
  const [offset, setOffset] = useState(0)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<NetworkUser[]>([])
  const [status, setStatus] = useState('Loading directory...')
  const [actionStatus, setActionStatus] = useState('')
  const [connecting, setConnecting] = useState<string[]>([])

  useEffect(() => {
    setSeoMeta({
      title: `People • ${portalProfile.portalTitle}`,
      description: 'Browse people profiles across Org Portal.',
      canonicalUrl: `${window.location.origin}/people`,
      type: 'website',
    })
  }, [portalProfile.portalTitle])

  useEffect(() => {
    const controller = new AbortController()
    setUsers([])
    setNextOffset(null)
    setIsAdmin(false)
    setAdminView(false)
    setOffset(0)
    if (token) fetch(orgUrl('/admin/me'), {headers:{Authorization:`Bearer ${token}`},signal:controller.signal})
      .then(response => response.ok ? response.json() : null)
      .then(data => {if (!controller.signal.aborted) {setIsAdmin(Boolean(data?.is_sysadmin));setAdminView(false);setUsers([]);setOffset(0)}})
      .catch(() => {})
    return () => controller.abort()
  }, [token])

  useEffect(() => {
    const controller = new AbortController()
    setUsers([])
    setStatus('Loading directory...')
    setNextOffset(null)
    const timer = window.setTimeout(async () => {
      try {
        setStatus('Loading directory...')
        const result = await loadPeopleDirectory({ token, query, offset, admin: isAdmin && adminView, signal: controller.signal })
        if (controller.signal.aborted) return
        setNextOffset(result.nextOffset)
        setUsers(result.users)
        setStatus(result.status)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setUsers([])
        setStatus(error instanceof Error ? error.message : 'Unable to load directory')
      }
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [token, query, offset, isAdmin, adminView])

  const totalLabel = `${users.length.toLocaleString()} ${users.length === 1 ? 'person' : 'people'}`

  async function requestConnection(person: NetworkUser) {
    if (connecting.includes(person.user_id)) return
    if (!token) {
      setActionStatus('Sign in to request a connection.')
      return
    }
    setActionStatus('')
    setConnecting((ids) => [...ids, person.user_id])
    try {
      const response = await fetch(orgUrl('/api/network/connections/request'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target_user_id: person.user_id }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => null) as { detail?: string } | null
        throw new Error(error?.detail || 'Unable to send the connection request. Please try again.')
      }
      setUsers((prev) =>
        prev.map((item) => (item.user_id === person.user_id ? { ...item, connection_status: 'pending_sent' } : item)),
      )
      setActionStatus(`Connection request sent to ${person.user_name}.`)
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : 'Connection request failed')
    } finally {
      setConnecting((ids) => ids.filter((id) => id !== person.user_id))
    }
  }

  return (
    <section className="panel" style={{ display: 'grid', gap: '1rem' }}>
      <h1 style={{ marginTop: 0 }}>People</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {adminView ? 'Administrator contact details and latest portal activity.' : 'Browse everyone in the community.'} {status ? status : `Showing ${totalLabel}.`}
      </p>

      <label style={{ display: 'grid', gap: '0.35rem', maxWidth: 420 }}>
        <span className="muted">Filter people</span>
        <input
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOffset(0) }}
          placeholder={adminView ? "Search by name or email" : "Search by name"}
          aria-label={adminView ? "Search accounts by name or email" : "Search people by name"}
        />
      </label>

      {isAdmin && <label><input type="checkbox" checked={adminView} onChange={event => {setAdminView(event.target.checked);setOffset(0)}} /> Show admin details</label>}
      {adminView && <p className="muted">Private profiles remain unpublished. “Not recorded” means no recent portal activity record is available.</p>}
      {organizationScope && <OrganizationPersonnelLegend />}
      {!status && users.length === 0 ? <p className="muted">No people found.</p> : null}
      {actionStatus ? (
        <p className="muted" role="status" style={{ margin: 0 }}>
          {actionStatus}
        </p>
      ) : null}

      <div style={{ display: 'grid', gap: '1.25rem' }}>
        {users.length > 0 ? (
          <section aria-labelledby="people-directory-heading" style={{ display: 'grid', gap: '0.9rem' }}>
            <h2 id="people-directory-heading" style={{ margin: 0, fontSize: '1.05rem' }}>
              People
            </h2>
            <ul className="people-directory-grid">{users.map((person) => {
              const isSelf = Boolean(user?.id && user.id === person.user_id)
              const contactSlug = person.contact_slug || person.slug
              const contactEnabled = person.contact_enabled ?? person.enabled ?? true
              const profilePath = contactSlug && (contactEnabled || isSelf)
                ? `/users/${encodeURIComponent(contactSlug)}${organizationScope ? `?org=${encodeURIComponent(organizationScope)}` : ''}`
                : isSelf ? '/profile' : null
              const summary = <>
                <OrganizationAvatar className="people-directory-photo" name={person.user_name} src={person.photo_url} status={personnelFor(person.user_id)} />
                <div className="people-directory-copy">
                  <h3>{person.user_name}</h3>
                  {adminView && <>
                    <p>{person.email || 'No email recorded'}</p>
                    <p>{person.contact_enabled ? 'Published profile' : 'Unpublished profile'}</p>
                    <p>Last portal activity: {person.last_active_at ? new Date(person.last_active_at).toLocaleString() : 'Not recorded'}</p>
                  </>}
                  {person.headline && <p>{person.headline}</p>}
                  {!profilePath && <p>Contact details are private</p>}
                </div>
              </>
              return <li key={person.user_id}>
                <article className="portal-card people-directory-card">
                  {profilePath ? <Link className="people-directory-summary" to={profilePath}>{summary}</Link>
                    : <div className="people-directory-summary">{summary}</div>}
                  {!adminView && <details className="people-directory-details">
                    <summary>Actions and details<span className="sr-only"> for {person.user_name}</span></summary>
                    {users.filter(other => other.user_name.trim().toLowerCase() === person.user_name.trim().toLowerCase()).length > 1 && <small className="muted" style={{ overflowWrap: 'anywhere' }}>Account: {person.user_id}</small>}
                    <div className="people-directory-actions">
                      {!isSelf && token && <Link to={`/meetings/${encodeURIComponent(person.user_id)}`} className="btn-secondary">Schedule a meeting</Link>}
                      {!isSelf && token ? (
                        <Link
                          to={`/chat?start=dm&userId=${encodeURIComponent(person.user_id)}&name=${encodeURIComponent(person.user_name)}`}
                          className="btn-primary"
                          style={{ textDecoration: 'none', width: 'fit-content' }}
                        >
                          Message {person.user_name}
                        </Link>
                      ) : null}
                      {!token ? (
                        <span className="muted">Sign in to connect</span>
                      ) : isSelf || person.connection_status === 'self' ? null : person.connection_status === 'connected' ? (
                        <span className="muted">Connected</span>
                      ) : person.connection_status === 'pending_sent' ? (
                        <span className="muted">Connection pending</span>
                      ) : person.connection_status === 'pending_received' ? (
                        <span className="muted">They requested to connect. Use notifications to respond.</span>
                      ) : (
                        <button type="button" className="btn-secondary" disabled={connecting.includes(person.user_id)} onClick={() => requestConnection(person)} aria-label={`Connect with ${person.user_name}`}>
                          {connecting.includes(person.user_id) ? 'Connecting…' : 'Connect'}
                        </button>
                      )}
                    </div>
                  </details>}
                </article>
              </li>
            })}</ul>
          </section>
        ) : null}

        <nav aria-label="People pages" style={{display:'flex',gap:'1rem',alignItems:'center'}}>
          <button type="button" disabled={offset === 0 || Boolean(status)} onClick={() => setOffset(Math.max(0,offset-40))}>Previous</button>
          <span>Page {Math.floor(offset/40)+1}</span>
          <button type="button" disabled={nextOffset === null || Boolean(status)} onClick={() => {if(nextOffset !== null) setOffset(nextOffset)}}>Next</button>
        </nav>
      </div>
    </section>
  )
}
