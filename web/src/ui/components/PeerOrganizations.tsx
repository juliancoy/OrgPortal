import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { OrgImage } from './media/OrgImage'
import type { PublicOrganization } from '../views/peopleDirectory'

export function PeerOrganizations({ organizationId, tags = [] }: { organizationId: string; tags?: string[] }) {
  const searchId = useId()
  const [organizations, setOrganizations] = useState<PublicOrganization[]>([])
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(12)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    void (async () => {
      const rows: PublicOrganization[] = []
      for (let offset = 0; ; offset += 500) {
        const response = await fetch(`/api/org/api/network/orgs/public?limit=500&offset=${offset}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Could not load peer organizations.')
        const page = await response.json() as PublicOrganization[]
        if (!Array.isArray(page)) throw new Error('Could not load peer organizations.')
        rows.push(...page)
        if (page.length < 500) break
      }
      if (!controller.signal.aborted) setOrganizations(rows)
    })().catch(err => { if (!controller.signal.aborted) setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision])
  useEffect(() => { setQuery(''); setLimit(12) }, [organizationId])
  const peers = useMemo(() => {
    const interests = new Set(tags.map(tag => tag.trim().toLowerCase()).filter(Boolean))
    const term = query.trim().toLowerCase()
    return organizations.filter(org => org.id !== organizationId).map(org => ({
      ...org, sharedTags: (org.tags || []).filter(tag => interests.has(tag.trim().toLowerCase())),
    })).filter(org => org.sharedTags.length && (!term || [org.name, org.description, ...(org.tags || [])].some(value => value?.toLowerCase().includes(term))))
      .sort((a, b) => b.sharedTags.length - a.sharedTags.length || a.name.localeCompare(b.name))
  }, [organizations, organizationId, tags, query])
  return <section className="portal-card peer-organizations" aria-label="Peer Organizations">
    <h2>Peer Organizations</h2>
    <p className="muted">Organizations with shared interests.</p>
    <label htmlFor={searchId}>Search peer organizations</label>
    <input id={searchId} type="search" placeholder="Search by name or interest" value={query} onChange={event => { setQuery(event.target.value); setLimit(12) }} />
    {loading ? <p role="status">Loading peer organizations…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Retry</button></p> : peers.length ? <>
      <div className="peer-organizations-grid">{peers.slice(0, limit).map(org => <Link key={org.id} to={`/orgs/${encodeURIComponent(org.slug)}`} className="peer-organization-card">
        <OrgImage src={org.image_url} alt="" className="peer-organization-image" />
        <div><strong>{org.name}</strong><p className="muted">{org.sharedTags.join(' · ')}</p></div>
      </Link>)}</div>
      {peers.length > limit && <button type="button" className="btn-secondary" onClick={() => setLimit(value => value + 12)}>Show more organizations</button>}
    </> : <p className="muted">{query.trim() ? `No peer organizations match “${query.trim()}”.` : 'No organizations with shared interests listed yet.'}</p>}
    <Link to="/orgs">Browse organization directory</Link>
  </section>
}
