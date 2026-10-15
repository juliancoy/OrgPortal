import {useEffect,useMemo,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {loadNetworkViewData,type NetworkData} from '../../features/ecosystem/networkViewData'
import {ecosystemOverview} from '../../features/ecosystem/ecosystemOverview'
import {useNetworkViewport} from '../../features/ecosystem/useNetworkViewport'
import '../../features/ecosystem/network.css'
import './ecosystem-overview.css'
const dollars=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'})
const count=(n:number)=>n.toLocaleString('en-US')
export function EcosystemOverviewPage(){
 const root=useRef<HTMLDivElement>(null);useNetworkViewport(root)
 const [data,setData]=useState<NetworkData|null>(null),[error,setError]=useState('')
 useEffect(()=>{document.title='Ecosystem overview';const abort=new AbortController();void loadNetworkViewData('overview',abort.signal).then(d=>{if(!abort.signal.aborted)setData(d)}).catch(()=>{if(!abort.signal.aborted)setError('The ecosystem overview could not load. Reload to try again.')});return()=>abort.abort()},[])
 const stats=useMemo(()=>data?ecosystemOverview(data):null,[data])
 const redacted=data?.organizations.find(o=>o.name==='Redacted')
 return <div ref={root} className="portal-ecosystem eco-page eco-secondary-view eco-overview">
  <header className="eco-network-heading"><h1>Ecosystem overview</h1><nav aria-label="Network views"><Link to="/ecosystem/network/performance">Performance</Link><Link to="/ecosystem/network/interventions">Interventions</Link><Link to="/ecosystem/network/nonprofits">Nonprofits</Link><Link to="/ecosystem/network/overview" aria-current="page">Overview</Link><Link to="/ecosystem/network">Graph</Link><Link to="/ecosystem/network/events">Events</Link><Link to="/ecosystem/network/relationships">Relationships</Link><Link to="/ecosystem/network/funding">Funding gap</Link><Link to="/ecosystem/network/help">Sources &amp; help</Link></nav></header>
  <section className="eco-view-content" tabIndex={0} aria-label="Ecosystem totals">
   <p className="eco-overview-intro">The scale of the network and the money documented across its funding records.</p>
   {!stats||!data?<p role="status">{error||'Loading ecosystem totals…'}</p>:<>
    <p className="eco-note" role="status">{data.offline?'Saved public evidence · live refresh unavailable · last checked ':'Public evidence checked '}{new Date(data.lastCheckedAt!).toLocaleString()}</p>
    <div className="eco-overview-metrics">
     <article className="eco-overview-money"><h2>Tracked USD volume</h2><strong data-metric="tracked-usd">{dollars(stats.trackedUsd)}</strong><p>Net value of {count(stats.disclosedUsdRecords)} distinct recorded USD funding observations. Each record counts once across its sender and recipient.</p><Link to="/ecosystem/network/relationships">Explore funding evidence →</Link></article>
     <article><h2>Organizations tracked</h2><strong data-metric="organizations">{count(stats.organizations)}</strong><p>{count(stats.identifiedOrganizations)} named organizations and {count(stats.placeholders)} unidentified-recipient grouping. Directory records may represent the same legal entity until their identities are verified.</p><Link to="/ecosystem/network">Explore the network →</Link></article>
    </div>
    <p className="eco-note">This is recorded funding volume, not verified cash flow or an economic money velocity rate. Cumulative obligations and reported awards can cover different periods. Sources without matching award IDs may describe overlapping funding.</p>
    <div className="eco-overview-metrics eco-overview-breakdown">
     <article><h2>Government obligations</h2><strong data-metric="government-usd">{dollars(stats.governmentUsd)}</strong><p>{count(stats.governmentAwards)} government award records. Lifetime cumulative obligations, including signed adjustments; amounts are not limited to the search period.</p></article>
     <article><h2>Other documented USD funding</h2><strong data-metric="other-usd">{dollars(stats.otherUsd)}</strong><p>Reported awards and funding outside the government obligation feed. Program ceilings, capitalization, portfolio aggregates and in-kind quantities are excluded.</p></article>
     <article><h2>Redacted recipients</h2><strong data-metric="redacted-usd">{dollars(stats.redactedUsd)}</strong><p>{count(stats.redactedAwards)} funding observations with unidentified recipients, already included in tracked USD volume. Redacted is a grouping, not one legal recipient.</p><Link to={`/ecosystem/network/relationships${redacted?`?org=${encodeURIComponent(redacted.id)}`:''}`}>View unidentified awards →</Link></article>
    </div>
    {data.governmentCoverage&&<p className="eco-note">Government coverage: {data.governmentCoverage.recipientState} recipients · USAspending date filter {data.governmentCoverage.start} through {data.governmentCoverage.end}{data.governmentCoverage.retrievedAt?` · retrieved ${new Date(data.governmentCoverage.retrievedAt).toLocaleString()}`:''}.</p>}
    {data.nonprofitCoverage&&<p><Link to="/ecosystem/network/nonprofits">Nonprofit evidence →</Link> {data.nonprofitCoverage.profileCount} profiles and {data.nonprofitCoverage.grantRecordCount.toLocaleString()} grant observations. {dollars(stats.nonprofitUsd)} in reported grant volume is included above; {dollars(stats.futureNonprofitUsd)} approved for future payment is excluded. Annual revenue, expenses and balance sheets remain separate from the funding volume above.</p>}
    <h2>Network coverage</h2>
    <dl className="eco-overview-counts">
     {[[stats.relationships,'Relationships recorded'],[stats.connectedOrganizations,'Organizations with connections'],[stats.events,'Event occurrences'],[stats.sourceLinks,'Distinct evidence links'],[stats.fundingRecords,'Funding observations'],[stats.undisclosedOrOtherCurrency,'Funding records without a disclosed USD amount']].map(([value,label])=><div key={label}><dt>{label}</dt><dd>{count(Number(value))}</dd></div>)}
    </dl>
    <details><summary>How these totals are counted</summary><p>The totals use the full public network, including organizations hidden by graph filters. Financial records are deduplicated by government award ID, record links, and matching source, recipient, amount, date and evidence URL. Voided records are excluded. Negative obligations reduce the money total; zero-dollar records remain in the counts. Relationship and financing copies of the same evidence are counted once.</p><p>Undisclosed amounts and non-USD currencies are omitted from USD totals without assuming zero. Incoming and outgoing amounts are not added together. These figures measure the available evidence, not a complete census or an additive transactional ledger. True money velocity would require actual dated transfers and a defined money supply.</p><p>Events are deduplicated by archive event identity. Evidence refresh times indicate when public data was checked, not when an award was paid.</p></details>
   </>}
  </section>
 </div>
}
