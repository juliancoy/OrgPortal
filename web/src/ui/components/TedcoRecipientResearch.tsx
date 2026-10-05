import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { applyEvidenceImport, filterEvidenceRecipients, previewEvidenceImport, type EvidenceManifest, type EvidencePreview } from './organizationEvidenceImport'
import manifestUrl from '../../data/tedco-recipients.json?url'
import fundingUrl from '../../data/tedco-recipient-funding-status.json?url'
import financingUrl from '../../data/tedco-company-financing.json?url'
import { financingImportBatches } from './financingImport'
import { equitySubtotal, type FinancingReport } from './companyFinancing'
import { rankRecipients, type FundingReport } from './tedcoFunding'
import { CompanyEvidence } from './TedcoCompanyEvidence'
import { fundingAmount, statusLabels } from './tedcoFunding'
import { CompanyIcon } from './CompanyIcon'
import { portalPath } from '../../config/portalBase'

export function TedcoRecipientResearch({ organizationId, registered, onImported }: {
  organizationId: string; registered: { id: string; name: string; slug: string }[]; onImported: () => void
}) {
  const { token } = useAuth()
  const [manifest, setManifest] = useState<EvidenceManifest | null>(null)
  const [funding, setFunding] = useState<FundingReport | null>(null)
  const [financing, setFinancing] = useState<FinancingReport | null>(null)
  const [consistency, setConsistency] = useState<{mode:string;stale?:boolean;applied_at?:string} | null>(null)
  const [metric, setMetric] = useState<'tedco' | 'equity'>('tedco')
  const [query, setQuery] = useState('')
  const [adjacentOnly, setAdjacentOnly] = useState(false)
  const [visibleCount, setVisibleCount] = useState(50)
  const [previews, setPreviews] = useState<EvidencePreview[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [financePreviews, setFinancePreviews] = useState<{previewId:string;changes:unknown;expiresAt:string}[] | null>(null)
  const [applied, setApplied] = useState(0)
  const operation = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(organizationId)}/financing`, {signal:controller.signal})
        if (!response.ok) throw new Error('Unable to load financing database records')
        const report = await response.json()
        if (!controller.signal.aborted) { setManifest(report.manifest); setFunding(report.funding); setFinancing(report.financing); setConsistency(report.consistency || null) }
      } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Financing unavailable') }
    }
    void load()
    const timer = window.setInterval(() => void load(), 60000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [organizationId])
  useEffect(() => {
    operation.current?.abort(); setPreviews(null); setFinancePreviews(null); setBusy(false); setApplied(0)
    return () => operation.current?.abort()
  }, [token])
  useEffect(() => { setVisibleCount(50) }, [query, adjacentOnly, metric])
  async function run(confirm: boolean) {
    if (!manifest || !token) return
    const controller = new AbortController(); operation.current = controller
    setBusy(true); setMessage(''); setApplied(0)
    const request = async (body: unknown) => {
      const response = await fetch(`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/support/import`, {
        method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Unable to import public recipient evidence')
      return result
    }
    try {
      if (confirm && previews) {
        await applyEvidenceImport(previews, request, setApplied)
        setPreviews(null); setMessage('TEDCO recipient organizations and sourced support records are registered.'); onImported()
      } else setPreviews(await previewEvidenceImport(manifest, organizationId, request))
    } catch (error) {
      if (!controller.signal.aborted) {
        setPreviews(null)
        setMessage(`${error instanceof Error ? error.message : 'Import failed'}. Completed batches remain registered; request a fresh preview to resume safely.`)
        onImported()
      }
    } finally { if (operation.current === controller) setBusy(false) }
  }
  async function storeFinancing() {
    if (!token) return
    setBusy(true); setMessage('')
    const controller=new AbortController(); operation.current=controller
    const request=async(body:unknown)=>{
      const response=await fetch(`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/financing/import`,{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)})
      const result=await response.json(); if(!response.ok) throw new Error(result.detail || 'Financing import failed'); return result
    }
    try {
      if(financePreviews){
        for(const preview of financePreviews) await request({...preview.changes as object,confirm:true,previewId:preview.previewId})
        setFinancePreviews(null); setMessage('Financing evidence stored in the primary database. Public views refresh automatically.'); onImported()
      }else{
        const responses=await Promise.all([fetch(manifestUrl),fetch(fundingUrl),fetch(financingUrl)])
        if(responses.some(r=>!r.ok)) throw new Error('Import evidence unavailable')
        const [input,report,ledger]=await Promise.all(responses.map(r=>r.json())) as [EvidenceManifest,FundingReport,FinancingReport]
        const batches=await financingImportBatches(input,report,ledger), previews=[]
        for(const batch of batches) previews.push(await request({...batch,confirm:false}))
        setFinancePreviews(previews)
      }
    }catch(error){setFinancePreviews(null);setMessage(`${error instanceof Error?error.message:'Import failed'}. Completed batches remain stored; preview again to resume.`)}
    finally { setBusy(false) }
  }
  if (!manifest) return message ? <p role="status">{message}</p> : <p>Loading TEDCO recipient research…</p>
  if (organizationId !== 'org-tedco' && manifest.recipients.length === 0) return null
  const filtered = new Set(filterEvidenceRecipients(manifest.recipients, query, adjacentOnly).map(row => row.key))
  const chartRows = (funding?.companies || []).map(row => metric === 'tedco' ? row : { ...row, totalUsd: equitySubtotal(financing?.events.filter(event => event.companyKey === row.key) || []) })
  const recipients = rankRecipients(chartRows).filter(row => filtered.has(row.key))
  const chartMaximum = Math.max(1,...chartRows.map(row=>row.totalUsd ?? 0))
  const metricLabel = metric === 'tedco' ? 'Agency funding' : 'company equity fundraising'
  const verifiedCompanies = financing?.audit.filter(row => row.status === 'partial').length || 0
  const adjacentCount = manifest.recipients.filter(row => row.tags.includes('LifeTech adjacent')).length
  const otherRegistered = registered.filter(org => !funding?.companies.some(row => row.organizationId === org.id))
  return <div className="tedco-recipient-research">
    <h3>Recipient funding ranking ({manifest.recipients.length} companies · {adjacentCount} LifeTech adjacent)</h3>
    <p>Highest documented {metricLabel} first. Click a company icon or name to open its page. Ranks and bar lengths stay the same when filtered. Unknown amounts follow the ranked companies.</p>
    {consistency?.mode === 'replica' && <p role="status">Read replica · last applied {consistency.applied_at || 'never'}.{consistency.stale && ' Refresh delayed; showing the last successful snapshot.'}</p>}
    {!token && message && <p role="status">{message}</p>}
    <label>Chart measure <select value={metric} onChange={event => setMetric(event.target.value as 'tedco' | 'equity')}><option value="tedco">Agency funding</option><option value="equity">Company equity fundraising</option></select></label>
    <p>Company fundraising coverage: {verifiedCompanies} of {manifest.recipients.length} companies have verified financing evidence; histories remain partial. {financing?.audit.filter(row => row.searchedAt).length || 0} companies searched; {manifest.recipients.length - verifiedCompanies} await primary-source verification. Unknown does not mean zero.</p>
    <details><summary>Financing methodology and audit queue</summary><p>{financing?.methodology}</p><p>Next review: {financing?.audit[0]?.nextReviewAt}. Search results are leads, not verified financing evidence.</p><ol>{financing?.audit.filter(row => filtered.has(row.key)).slice(0,30).map(row => <li key={row.key}>{row.name} · {row.status === 'partial' ? 'Verified rounds; history incomplete' : 'Primary-source verification pending'} · {row.searchedAt ? `Searched ${row.searchedAt}` : 'Search pending'}{row.candidateSources.map(source => <p key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.outcome === 'verified' ? 'Verified financing source' : 'Pending research lead'}: {source.title}</a>{source.outcome === 'verified' && <span> · {source.transactionIds?.length} financing record(s) added</span>}</p>)}</li>)}</ol><a href={`/api/org/api/network/orgs/public/${encodeURIComponent(organizationId)}/financing`} download>Download all financing events and the complete audit queue</a></details>
    {manifest.recipients.length === 0 && <p>Financing research awaits an authorized import into the primary transactional database.</p>}
    <p>{manifest.coverage} Reviewed {manifest.reviewedAt}. Entries without an organization link are researched recipients awaiting directory registration.</p>
    <details><summary>Funding ranking methodology and coverage</summary><p>{funding?.methodology}</p><p>Operating status records activity on the source date. A bought company can continue operating under its acquirer. Missing or unreachable websites do not establish that a company is defunct.</p></details>
    <p><a href={`/api/org/api/network/orgs/public/${encodeURIComponent(organizationId)}/financing`} download>Download current database-derived financing and audit evidence</a></p>
    <div className="support-recipient-filters">
      <label>Search researched recipients<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label><input type="checkbox" checked={adjacentOnly} onChange={event => setAdjacentOnly(event.target.checked)} /> LifeTech adjacent only</label>
      <p role="status">Showing {Math.min(visibleCount, recipients.length)} of {recipients.length} matching companies · {manifest.recipients.length} researched recipients overall</p>
    </div>
    <p className="tedco-chart-scale">Documented {metricLabel} · bars share a $0–{fundingAmount(chartMaximum)} scale, including when filtered. {metric === 'equity' && 'Partial, minimum documented amounts; not lifetime totals. TEDCO contributions are not added to rounds.'}</p>
    <ul className="tedco-funding-chart" aria-label={`${metricLabel} by company`}>{recipients.slice(0, visibleCount).map(row => {
      const recipient = manifest.recipients.find(item => item.key === row.key)!
      const org = registered.find(item => item.id === row.organizationId)
      const recipientSlug = org?.slug || row.organizationSlug
      const href = recipientSlug ? `/orgs/${recipientSlug}` : row.websiteUrl || recipient.support.sourceUrl
      const reference = <><CompanyIcon name={row.name} src={row.iconUrl ? portalPath(row.iconUrl) : undefined} /><span>{row.name}</span></>
      return <li key={row.key}>
        <div className="tedco-chart-heading">
          {recipientSlug ? <Link className="tedco-company-reference" to={href}>{reference}</Link> : <a className="tedco-company-reference" href={href} target="_blank" rel="noreferrer">{reference}</a>}
          <strong className="tedco-chart-amount">{row.rank !== null && <span>#{row.rank} · </span>}{fundingAmount(row.totalUsd)}</strong>
        </div>
        {row.totalUsd !== null ? <div className="tedco-bar-track" role="meter" aria-label={`${row.name} documented ${metricLabel}`} aria-valuemin={0} aria-valuemax={chartMaximum} aria-valuenow={row.totalUsd} aria-valuetext={`${fundingAmount(row.totalUsd)}${metric === 'equity' ? ' minimum documented; partial history' : ''}`}><span style={{width:`${row.totalUsd/chartMaximum*100}%`}} /></div> : <p className="tedco-funding-unknown">No verified amount — excluded from the chart scale.</p>}
        <div className="tedco-chart-meta"><span>{statusLabels[row.status.value]}</span>{recipient.tags.includes('LifeTech adjacent') && <span className="support-adjacent-tag">LifeTech adjacent</span>}<a href={recipient.support.sourceUrl} target="_blank" rel="noreferrer">Recipient source</a></div>
        <p>Company fundraising: {financing?.audit.find(item => item.key === row.key)?.reviewedAt ? `partial history, reviewed ${financing.audit.find(item => item.key === row.key)?.reviewedAt}` : 'primary-source verification pending'}.</p>
        {financing?.events.filter(event => event.companyKey === row.key).map(event => <p className="tedco-other-funding" key={event.id}>{event.amountQualifier === 'over' ? 'Over ' : event.amountQualifier === 'up-to' ? 'Up to ' : ''}{fundingAmount(event.amountUsd)} · {event.label} · {event.announcedAt} · {event.type}. {event.investors.length ? `Reported investors: ${event.investors.join(', ')}. ` : 'Investors not documented in this record. '}{event.notes} {event.sourceUrls.map((url,index)=><a key={url} href={url} target="_blank" rel="noreferrer">Source {index + 1} </a>)}</p>)}
        <CompanyEvidence company={funding!.companies.find(company => company.key === row.key)!} showSummary={false} />
      </li>
    })}</ul>
    {visibleCount < recipients.length && <button onClick={() => setVisibleCount(count => count + 50)}>Load more recipients ({Math.min(visibleCount, recipients.length)} of {recipients.length})</button>}
    {otherRegistered.length > 0 && <><h4>Other registered descendants · funding unranked</h4><ul className="support-organizations">{otherRegistered.map(org => <li key={org.id}><Link to={`/orgs/${org.slug}`}>{org.name}</Link> · Funding total unknown · Status unknown</li>)}</ul></>}
    {token && organizationId === 'org-tedco' && <div className="support-preview">
      <h3>Import reviewed financing evidence</h3><p>Operator permission and a fresh preview are required. Public views use database records exclusively.</p>
      {financePreviews && <details><summary>Review {financePreviews.length} transactional batches before applying</summary>{financePreviews.map(preview=><pre key={preview.previewId} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(preview.changes,null,2)}</pre>)}<button onClick={()=>setFinancePreviews(null)}>Cancel financing review</button></details>}
      <button disabled={busy} onClick={()=>void storeFinancing()}>{financePreviews?'Confirm reviewed financing import':'Preview financing database import'}</button>
      {message && <p role="status">{message}</p>}
    </div>}
    {token && <div className="support-preview">
      <h3>Register researched recipients</h3>
      <p>OrgPortal operator access is required. Review the identity matches, tags and source evidence before confirming. Existing tags are retained. This creates public organization pages and support records; it grants no memberships or ownership and makes no payments.</p>
      {previews && <>
        <p>Review expires {new Date(previews[0].expiresAt).toLocaleTimeString()}. {previews.flatMap(preview => preview.plan).filter(item => !item.existing).length} new organizations; {previews.flatMap(preview => preview.plan).filter(item => !item.record).length} new support records.</p>
        <details><summary>Review all organization matches and resulting tags</summary><ul className="support-organizations">{previews.flatMap(preview => preview.plan).map(item => <li key={item.id}>{item.row.name} → {item.existing?.name || 'New public organization'} · {item.tags.join(', ')} · {item.row.support.occurredAt} · <a href={item.row.support.sourceUrl} target="_blank" rel="noreferrer">Evidence</a><small className="research-company-detail">{item.row.support.evidence} {item.row.support.notes}</small></li>)}</ul></details>
        <button disabled={busy} onClick={() => setPreviews(null)}>Cancel review</button>
      </>}
      <button className="btn-primary" disabled={busy} onClick={() => void run(Boolean(previews))}>{busy ? `Working… ${applied} recipients registered` : previews ? 'Confirm reviewed organizations and support' : 'Preview recipient registration'}</button>
      {message && <p role="status">{message}</p>}
    </div>}
  </div>
}
