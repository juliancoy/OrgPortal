import {useEffect,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {portalPath} from '../../config/portalBase'
import {useEcosystemQuery,type QueryPage} from '../../features/ecosystem/ecosystemApi'
import {type PerformanceData,type PerformanceAward,type PerformanceAssessment} from '../../features/ecosystem/performance'
import {useNetworkViewport} from '../../features/ecosystem/useNetworkViewport'
import '../../features/ecosystem/network.css'
import './ecosystem-overview.css'
import './public-funding-performance.css'
const usd=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2})
const reviewLink=(url:string)=>url.startsWith('/')?portalPath(url):url
export function PublicFundingPerformancePage(){
 const root=useRef<HTMLDivElement>(null);useNetworkViewport(root)
 const [query,setQuery]=useState(''),[view,setView]=useState('reviewed'),[cohort,setCohort]=useState(''),[page,setPage]=useState(0)
 type Result=QueryPage<PerformanceAward&{assessment?:PerformanceAssessment}> & {coverage:PerformanceData['coverage'];sourceGeneratedAt:string;cohorts:string[];federalCount:number;reviewedCount:number;unassessedCount:number;recipientCount:number;unidentifiedCount:number;unidentifiedUsd:number;exposures:{id:string;name:string;amount:number;awards:number}[]}
 const {data,error}=useEcosystemQuery<Result>('performance',{q:query,view,cohort,offset:page*25,limit:25})
 useEffect(()=>{document.title='Public funding performance'},[])
 const cohorts=data?.cohorts||[],isReview=['reviewed','strongest','shortfalls'].includes(view),filtered=data?.records||[],exposures=data?.exposures||[]
 const change=(fn:()=>void)=>{fn();setPage(0)}
 return <div ref={root} className="portal-ecosystem eco-page eco-secondary-view eco-overview eco-performance">
  <header className="eco-network-heading"><h1>Public funding performance</h1><nav aria-label="Network views"><Link to="/ecosystem/network/performance" aria-current="page">Performance</Link><Link to="/ecosystem/network/overview">Common data</Link><Link to="/ecosystem/network/interventions">Interventions</Link><Link to="/ecosystem/network">Graph</Link></nav></header>
  <section className="eco-view-content" tabIndex={0} aria-label="Public funding scorecards">
   <p>Compare documented commitments with government-reported outcomes. Funding size measures exposure; it does not establish success or failure.</p>
   {error?<p role="alert">{error}</p>:!data?<p role="status">Loading funding evidence…</p>:<>
    <div className="performance-boundary"><strong>Historical pilot, not a current company league table</strong><p>Three selected Maryland Commerce conditional-loan reviews measure employment compliance on December 31, 2018. They show attainment of each recipient’s own target, across different company sizes. Later outcomes and resolutions have not been established. No current “best” or “worst” company rating is implied.</p></div>
    <div className="eco-overview-metrics eco-overview-breakdown">
     <article><h2>Federal grant awards</h2><strong data-metric="federal-awards">{data.federalCount.toLocaleString()}</strong><p>Maryland recipients: companies, nonprofits and public bodies. Federal contracts and state/local funding are outside this feed.</p></article>
     <article><h2>Named federal recipient records</h2><strong>{data.recipientCount.toLocaleString()}</strong><p>Source identities; not a verified census of distinct companies.</p></article>
     <article><h2>Historical outcome reviews</h2><strong data-metric="reviewed-outcomes">{data.reviewedCount.toLocaleString()}</strong><p>{data.unassessedCount.toLocaleString()} funding records remain unassessed.</p></article>
    </div>
    <p>{data.unidentifiedCount.toLocaleString()} unidentified awards · {usd(data.unidentifiedUsd)} net federal obligations. These remain in funding records and totals; Redacted is a grouping and receives no performance ranking.</p>
    <p className="eco-note">USAspending overlap filter: {data.coverage.start} to {data.coverage.end}. Federal amounts are signed lifetime cumulative obligations, not payments or spending within that period. Retrieved {new Date(data.coverage.retrievedAt).toLocaleString()}. State pilot amounts are original conditional-loan principal and are not added to federal obligations. Dataset built {new Date(data.sourceGeneratedAt).toLocaleString()}.</p>
    {!data.reviewedCount&&<p role="status">No reviewed outcome evidence is available. All funding records are unassessed.</p>}
    <div className="performance-controls">
     <label>Search recipient, award or agency<input value={query} onChange={e=>change(()=>setQuery(e.target.value))}/></label>
     <label>Evidence view<select value={view} onChange={e=>change(()=>setView(e.target.value))}><option value="reviewed">Documented target attainment</option><option value="strongest">Met or exceeded target</option><option value="shortfalls">Documented target shortfalls</option><option value="exposure">Largest unassessed federal awards</option><option value="unassessed">All unassessed records</option></select></label>
     {isReview&&<label>Comparable cohort<select value={cohort||data.cohorts[0]||''} onChange={e=>change(()=>setCohort(e.target.value))}><option value="">Choose a cohort</option>{cohorts.map(c=><option key={c}>{c}</option>)}</select></label>}
    </div>
    <p>{data.total.toLocaleString()} matching records. {isReview?'Ordered by target attainment within the selected cohort.':'Ordered by funding amount; this is not a performance ranking.'}</p>
    {filtered.map(r=><article className="performance-card" key={r.awardKey}>
     <h2>{r.recipientName}</h2><p>{r.agency} · {r.awardId}</p><p><strong>{usd(r.amount)}</strong> · {r.financialMeasure}</p>
     {r.assessment?<>
      <p className="performance-outcome"><strong>{r.assessment.attainment===null?'Target met · zero measured outcome':`${(r.assessment.attainment*100).toFixed(1)}% of target`}</strong> · {r.assessment.meetsTarget?'Met or exceeded target':'Below target'}</p>
      <p>Historical measurement: <strong>{r.assessment.measuredDate}</strong> · {r.assessment.actual.toLocaleString()} / {r.assessment.target.toLocaleString()} {r.assessment.unit} · {r.assessment.evidenceBasis}</p>
     </>:<p>Unassessed — outcome evidence missing</p>}
     <details><summary>Funding evidence and assessment</summary>
      <p>{r.description}{r.program==='Federal grants'?' (Description excerpt; see the complete award at the source.)':''}</p><a href={r.sourceUrl} target="_blank" rel="noreferrer">{r.sourceName} source record ↗</a>
      {r.assessment&&<>
       <p>Metric: {r.assessment.metric}. {r.assessment.direction==='higher'?'Higher':'Lower'} is better. Reporting deadline {r.assessment.dueDate}.</p>
       <p>{r.assessment.commitment} <a href={r.assessment.commitmentUrl}>Agency-published commitment ↗</a></p>
       <p>{r.assessment.result} <a href={r.assessment.resultUrl}>Outcome evidence ↗</a></p>
       <p>Methodology: {r.assessment.methodology}</p>
       <p>Source transcription reviewed by {r.assessment.reviewerOrganization}, {r.assessment.reviewedDate}. This review date does not make the underlying outcome current. <a href={reviewLink(r.assessment.reviewUrl)}>Source review and limitations ↗</a></p>
       <p>Source-reported recipient name only; no legal-entity match to the federal directory has been inferred.</p>
      </>}
     </details>
     {r.networkOrganizationId&&<Link to={`/ecosystem/network/relationships?org=${encodeURIComponent(r.networkOrganizationId)}`}>Common funding records →</Link>}
    </article>)}
    {!filtered.length&&<p>No matching records. Choose another evidence view or cohort.</p>}
    <div className="performance-controls"><button disabled={!page} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page+1} of {Math.max(1,Math.ceil(data.total/25))}</span><button disabled={data.nextOffset===null} onClick={()=>setPage(page+1)}>Next</button></div>
    <details><summary>Largest federal recipient funding exposure</summary><p>Net cumulative obligations across tracked federal awards per named source identity. State conditional loans are excluded. These are exposure totals, not performance scores.</p>{exposures.slice(0,10).map(r=><p key={r.id}><Link to={`/ecosystem/network/relationships?org=${encodeURIComponent(r.id)}`}>{r.name}</Link> · {usd(r.amount)} · {r.awards.toLocaleString()} awards</p>)}</details>
    <details><summary>Methodology, sources and coverage limits</summary>
     <p>Each outcome review links a named government funding observation to an agency-published commitment, an outcome at or after its reporting deadline, and a dated source transcription review. It is not an independent audit or a verification of current compliance. “Company-reported” and “certified” describe the agency report’s evidence basis.</p>
     <p>Higher-is-better attainment is actual divided by a positive target; lower-is-better is target divided by actual. A zero actual for lower-is-better meets the target and has no finite ratio. Comparisons require the same program, metric, units, direction and methodology. This pilot compares compliance with individual employment commitments; it does not compare jobs newly created, company-wide quality, causal impact or cost effectiveness. Different company sizes and agreement terms limit interpretation.</p>
     <p>The historical source has an FY19 filename and a table titled FY18; individual row measurement dates govern these assessments. Three selected rows are not a representative sample. Later amendments, repayments and resolutions may change the picture. <a href={portalPath('/ecosystem-data/sources/maryland-medaaf-review.json')}>Review metadata</a> · <a href={portalPath('/ecosystem-data/sources/maryland-medaaf-fy2019.pdf')}>Preserved government source PDF</a>.</p>
     <p>Company-wide performance aggregation is withheld until coverage and comparability support it. Negative obligations are adjustments, not evidence of misconduct. Unknown results and immature projects remain unassessed. No findings are inferred from allegations. State pilot observations are separate from the common transactional ledger.</p>
     <p>Further source discovery: <a href="https://commerce.maryland.gov/document-library">Maryland Commerce reports</a>, <a href="https://ola.maryland.gov/Search/Report">Maryland legislative audits</a> and <a href="https://sam.gov/entity-information">SAM responsibility and exclusions</a>. Audits, exclusions and comprehensive state funding have not been imported.</p>
    </details>
   </>}
  </section>
 </div>
}
