import {portalPath} from '../../config/portalBase'
import {companyLocationBenchmark as source,companyLocationStats} from './companyRetention'
const percent=(value:number|null)=>value===null?'Not available':`${value.toFixed(2)}%`
export function CompanyRetentionSummary(){
 const stats=companyLocationStats(source)
 return <section aria-labelledby="company-retention-heading" className="eco-company-retention">
  <h2 id="company-retention-heading">Company location and retention</h2>
  <p>Maryland is the departure boundary. The available public source gives a statewide historical benchmark; a Baltimore-funded departure rate still needs linked funding and relocation records.</p>
  <div className="eco-overview-metrics">
   <article>
    <h3>TEDCO-supported companies outside Maryland</h3>
    <strong data-metric="companies-outside-maryland">{percent(stats.outsidePercent)}</strong>
    <p><b>{source.outsideMaryland} of {source.totalCompanies} companies</b> in the study’s reconstructed portfolio were located outside Maryland. <b>2018 statewide snapshot</b> — not a current rate or a Baltimore-only cohort.</p>
    <p>{source.operatingInformationUnavailable} companies ({percent(stats.unknownPercent)}) had no operating information. They remain in the denominator; their location is unknown.</p>
    <a href={`${source.sourceUrl}#page=8`} target="_blank" rel="noreferrer">TEDCO source · footnote 5, PDF pages 7–8 ↗</a>
   </article>
   <article>
    <h3>Baltimore-funded companies that later left Maryland</h3>
    <strong data-metric="post-funding-departure-rate">Not yet measurable</strong>
    <p>A location outside Maryland does not prove a company moved after receiving money. The available records do not establish the Baltimore-funded cohort or the sequence of funding and relocation.</p>
    <p>This percentage will require unique company identities, evidence of funding received while in the Baltimore area, and dated evidence of a later move out of Maryland. Unknown outcomes must remain visible.</p>
   </article>
  </div>
  <details>
   <summary>Company counts, calculation and source limits</summary>
   <dl className="eco-overview-counts" aria-label="Company location counts">
    {[[source.totalCompanies,'Companies in the source cohort'],[source.inMaryland,'Active companies in Maryland'],[source.outsideMaryland,'Companies outside Maryland'],[source.operatingInformationUnavailable,'Companies without operating information']].map(([value,label])=><div key={label}><dt>{label}</dt><dd>{Number(value).toLocaleString('en-US')}</dd></div>)}
   </dl>
   <p>Calculation: {source.outsideMaryland} ÷ {source.totalCompanies} × 100 = {percent(stats.outsidePercent)}. The denominator is all source-cohort companies, including unknown outcomes, rather than only the companies still active in Maryland. This is a company-count share, not a share of funding dollars.</p>
   <p>{source.methodology}</p>
   <ul>{source.limitations.map(limit=><li key={limit}>{limit}</li>)}</ul>
   <p>Source: {source.sourceTitle}, published by {source.publisher}; prepared by {source.authors}. Observation year {source.observationYear}; source retrieved {new Date(source.retrievedAt).toLocaleDateString('en-US')}.</p>
   <p><a href={portalPath(source.archiveUrl)+'#page=8'}>Preserved source PDF</a> · <a href={source.laterReport.sourceUrl} target="_blank" rel="noreferrer">2023 study methodology ↗</a>. {source.laterReport.note}</p>
   <p className="eco-note">Preserved source SHA-256: <code>{source.sourceSha256}</code></p>
  </details>
 </section>
}
