import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { portalPath } from '../../config/portalBase'
import type { NetworkData, NetworkOrganization, NetworkEvent, NetworkRelationship } from '../../features/ecosystem/networkViewData'
import { useEcosystemQuery, type QueryPage } from '../../features/ecosystem/ecosystemApi'
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
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [params, setParams] = useSearchParams()
  const selected = params.get('org') || ''
  const {data:page,error}=useEcosystemQuery<QueryPage<NetworkEvent|NetworkRelationship>>(view==='help'?'organizations':view,{q:query,org:selected,offset,limit:100})
  const {data:directory}=useEcosystemQuery<QueryPage<NetworkOrganization>>('organizations',{q:params.get('orgSearch')||'',limit:100})
  const data:NetworkData|null=page?{organizations:directory?.records||[],relationships:view==='relationships'?page.records as NetworkRelationship[]:[],events:view==='events'?page.records as NetworkEvent[]:[],financing:[]}:null
  useEffect(()=>{document.title=`${labels[view]} · Organization network`},[view])
  useEffect(()=>setOffset(0),[view,selected,query])
  const events=data?.events||[],relationships=data?.relationships||[]
  return <div ref={root} className="portal-ecosystem eco-page eco-secondary-view">
    <header className="eco-network-heading"><h1>{labels[view]}</h1><nav aria-label="Network views"><Link to="/ecosystem/network/performance">Performance</Link><Link to="/ecosystem/network/interventions">Interventions</Link><Link to="/ecosystem/network/nonprofits">Nonprofits</Link><Link to="/ecosystem/network/overview">Overview</Link>
      <Link to={`/ecosystem/network${selected ? `?org=${encodeURIComponent(selected)}` : ''}`}>Graph</Link>
      {Object.entries(labels).map(([key, label]) => <Link key={key} to={`/ecosystem/network/${key}${selected ? `?org=${encodeURIComponent(selected)}` : ''}`} aria-current={view === key ? 'page' : undefined}>{label}</Link>)}
      <Link to="/ecosystem/network/funding">Funding gap</Link>
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
        <p>Government grant evidence comes directly from USAspending. Amounts represent cumulative award obligations, not payments or spending limited to the search period. Each award retains its government ID, source link and retrieval date. “Redacted” groups undisclosed recipients without asserting that they are one legal entity; their individual awards and net obligations remain recorded.</p>
        <p>Sources and evidence labels are preserved from the LifeTech Associates spreadsheet and public organization reports. They have not been independently audited. Event listings do not imply funding or hosting.</p>
        <p>Proximity combines mission alignment (40%), functional complement (25%), Baltimore connectivity (20%), and community accessibility (15%). It is a curated relevance score, not a quality rating. Dashboard contributions remain separate.</p>
        <p>Funded nodes show pie slices proportional to disclosed USD awards. TEDCO’s administered funds appear inside TEDCO; select it to see each fund’s name, amounts, dates and sources. The same fund keeps the same slice color on its recipients. Receipts and onward awards are never added together. Pies represent recorded awards, not full fund sizes or available cash. Programs retain distinct identities and links to parent institutions. Generic recipients such as “portfolio companies” appear in the Relationships view rather than being invented as individual organizations. Contact names and personal email columns are withheld.</p>
        <p><a href={portalPath('/ecosystem-data/ecosystem-government.json')}>Download government award evidence</a> · <a href={portalPath('/ecosystem-data/ecosystem-portal.json')}>Download organization evidence</a> · <a href={portalPath('/ecosystem-data/ecosystem-history.json')}>Download complete sourced event history</a></p>
      </> : <>
        <p>{view === 'events' ? 'Past and upcoming events across the ecosystem. Listings do not imply funding or hosting.' : 'All documented relationships, including aggregate scopes and program terms excluded from the graph. Amounts are not additive.'}</p>
        <div className="eco-view-filters"><label>Search {labels[view].toLowerCase()}<input type="search" value={query} onChange={event => {setQuery(event.target.value);setOffset(0)}} /></label>
          <label>Find an organization<input type="search" value={params.get('orgSearch')||''} onChange={event=>{const next=new URLSearchParams(params);next.set('orgSearch',event.target.value);setParams(next)}} /></label><label>Organization<select value={selected} onChange={event => {setOffset(0);const next=new URLSearchParams(params);if(event.target.value)next.set('org',event.target.value);else next.delete('org');setParams(next)}}><option value="">All organizations</option>{selected&&!data?.organizations.some(o=>o.id===selected)&&<option value={selected}>Selected organization</option>}{data?.organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label></div>
        {!data && <p role="status">{error || 'Loading public evidence…'}</p>}
        {data && <><p className="eco-note" role="status">Evidence snapshot built {new Date(page!.generatedAt).toLocaleString()}</p>
          {view === 'events' ? <><p>{page!.total.toLocaleString()} events · showing {offset+1}–{offset+events.length}</p><ul id="event-results">{events.map(event => <li key={event.id}><a href={sourceUrl(event.sourceUrl)} target="_blank" rel="noopener noreferrer">{event.title}</a> · {event.date || 'Date not supplied'} · {event.organizationName || 'Organization not supplied'}{event.location ? ` · ${event.location}` : ''}</li>)}</ul></> : <><p>{page!.total.toLocaleString()} relationships · showing {offset+1}–{offset+relationships.length}</p><div id="network-table" dangerouslySetInnerHTML={{ __html: relationshipTable({ ...data, relationships }) }} /></>}
          <div className="eco-view-filters"><button type="button" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-100))}>Previous</button><button type="button" disabled={page?.nextOffset==null} onClick={()=>setOffset(page!.nextOffset!)}>Next</button></div>
        </>}
      </>}
    </section>
  </div>
}
