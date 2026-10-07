import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { portalPath } from '../../config/portalBase'
import { loadNetworkViewData, type NetworkData } from '../../features/ecosystem/networkViewData'
import { relationshipTable } from '../../features/ecosystem/ecosystem-view.js'
import { useNetworkViewport } from '../../features/ecosystem/useNetworkViewport'
import '../../features/ecosystem/network.css'

const labels = { events: 'Events', relationships: 'Relationships', help: 'Sources & help' }
function sourceUrl(value: string) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined }
  catch { return undefined }
}

export function EcosystemNetworkViews({ view }: { view: keyof typeof labels }) {
  const root = useRef<HTMLDivElement>(null)
  useNetworkViewport(root)
  const [data, setData] = useState<NetworkData | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const search = useDeferredValue(query.trim().toLowerCase())
  const [limit, setLimit] = useState(100)
  const [params, setParams] = useSearchParams()
  const selected = params.get('org') || ''
  useEffect(() => {
    document.title = `${labels[view]} · Organization network`
    setData(null); setError(''); setQuery(''); setLimit(100)
    if (view === 'help') return
    const abort = new AbortController()
    void loadNetworkViewData(view, abort.signal).then(data => { if (!abort.signal.aborted) setData(data) }).catch(() => { if (!abort.signal.aborted) setError('Public evidence could not load. Reload to try again.') })
    return () => abort.abort()
  }, [view])
  useEffect(() => setLimit(100), [search, selected])
  const events = (data?.events || []).filter(event => (!selected || event.organizationId === selected) && (!search || `${event.title} ${event.organizationName} ${event.location} ${event.date}`.toLowerCase().includes(search)))
  const relationships = (data?.relationships || []).filter(record => (!selected || record.source === selected || record.target === selected) && (!search || `${record.sourceLabel} ${record.targetLabel} ${record.type} ${record.kind} ${record.date}`.toLowerCase().includes(search)))
  return <div ref={root} className="portal-ecosystem eco-page eco-secondary-view">
    <header className="eco-network-heading"><h1>{labels[view]}</h1><nav aria-label="Network views">
      <Link to={`/ecosystem/network${selected ? `?org=${encodeURIComponent(selected)}` : ''}`}>Graph</Link>
      {Object.entries(labels).map(([key, label]) => <Link key={key} to={`/ecosystem/network/${key}${selected ? `?org=${encodeURIComponent(selected)}` : ''}`} aria-current={view === key ? 'page' : undefined}>{label}</Link>)}
      <Link to="/orgs">Directory ↗</Link>
    </nav></header>
    <section className="eco-view-content" tabIndex={0} aria-label={labels[view]}>
      {view === 'help' ? <>
        <h2>Explore the relationship graph</h2>
        <p>Drag to pan, use the scroll wheel or pinch to zoom, and select a label for details. Right-drag to orbit. Filters change which organizations and relationships appear.</p>
        <p>Green lines show USD funding; yellow shows in-kind donations; teal shows collaboration. Arrows point to recipients. Solid lines show funding, dashed lines show affiliation, and dotted lines show programs.</p>
        <p>Node size reflects the largest disclosed USD funding or award sent or received, on a logarithmic scale. Funding line width also uses a logarithmic amount scale. Unknown amounts use a small baseline. Larger documented financial ties create stronger attraction; nodes maintain a collision gap.</p>
        <h2>Sources and interpretation</h2>
        <p>Funding awards, per-company program terms, fund capitalization, portfolio aggregates and co-investment totals are distinct and must not be summed. An award or commitment does not establish cash disbursement. Undisclosed amounts remain unknown.</p>
        <p>Sources and evidence labels are preserved from the LifeTech Associates spreadsheet and public organization reports. They have not been independently audited. Event listings do not imply funding or hosting.</p>
        <p>Proximity combines mission alignment (40%), functional complement (25%), Baltimore connectivity (20%), and community accessibility (15%). It is a curated relevance score, not a quality rating. Dashboard contributions remain separate.</p>
        <p>Programs retain distinct identities and links to parent institutions. Generic recipients such as “portfolio companies” appear in the Relationships view rather than being invented as individual organizations. Contact names and personal email columns are withheld.</p>
        <p><a href={portalPath('/ecosystem-data/ecosystem-portal.json')}>Download organization evidence</a> · <a href={portalPath('/ecosystem-data/ecosystem-history.json')}>Download complete sourced event history</a></p>
      </> : <>
        <p>{view === 'events' ? 'Past and upcoming events across the ecosystem. Listings do not imply funding or hosting.' : 'All documented relationships, including aggregate scopes and program terms excluded from the graph. Amounts are not additive.'}</p>
        <div className="eco-view-filters"><label>Search {labels[view].toLowerCase()}<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <label>Organization<select value={selected} onChange={event => setParams(event.target.value ? { org: event.target.value } : {})}><option value="">All organizations</option>{data?.organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label></div>
        {!data && <p role="status">{error || 'Loading public evidence…'}</p>}
        {data && <><p className="eco-note" role="status">{data.offline ? 'Saved evidence · refresh unavailable · last checked ' : 'Public evidence checked '}{new Date(data.lastCheckedAt!).toLocaleString()}</p>
          {view === 'events' ? <><p>{events.length.toLocaleString()} events · showing {Math.min(limit, events.length)}</p><ul id="event-results">{events.slice(0, limit).map(event => <li key={event.id}><a href={sourceUrl(event.sourceUrl)} target="_blank" rel="noopener noreferrer">{event.title}</a> · {event.date || 'Date not supplied'} · {event.organizationName || 'Organization not supplied'}{event.location ? ` · ${event.location}` : ''}</li>)}</ul></> : <><p>{relationships.length.toLocaleString()} relationships · showing {Math.min(limit, relationships.length)}</p><div id="network-table" dangerouslySetInnerHTML={{ __html: relationshipTable({ ...data, relationships: relationships.slice(0, limit) }) }} /></>}
          {limit < (view === 'events' ? events.length : relationships.length) && <button type="button" onClick={() => setLimit(limit + 100)}>Show more {labels[view].toLowerCase()}</button>}
        </>}
      </>}
    </section>
  </div>
}
