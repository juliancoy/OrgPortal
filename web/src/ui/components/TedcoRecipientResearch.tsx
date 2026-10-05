import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { applyEvidenceImport, filterEvidenceRecipients, previewEvidenceImport, type EvidenceManifest, type EvidencePreview } from './organizationEvidenceImport'
import manifestUrl from '../../data/tedco-recipients.json?url'
import reviewUrl from '../../data/tedco-recipient-review.json?url'
import fundingUrl from '../../data/tedco-recipient-funding-status.json?url'
import { rankRecipients, type FundingReport } from './tedcoFunding'
import { CompanyEvidence } from './TedcoCompanyEvidence'

export function TedcoRecipientResearch({ organizationId, registered, onImported }: {
  organizationId: string; registered: { id: string; name: string; slug: string }[]; onImported: () => void
}) {
  const { token } = useAuth()
  const [manifest, setManifest] = useState<EvidenceManifest | null>(null)
  const [funding, setFunding] = useState<FundingReport | null>(null)
  const [query, setQuery] = useState('')
  const [adjacentOnly, setAdjacentOnly] = useState(false)
  const [visibleCount, setVisibleCount] = useState(50)
  const [previews, setPreviews] = useState<EvidencePreview[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [applied, setApplied] = useState(0)
  const operation = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([fetch(manifestUrl, { signal: controller.signal }), fetch(fundingUrl, { signal: controller.signal })]).then(async responses => {
      if (responses.some(response => !response.ok)) throw new Error('Unable to load TEDCO recipient research')
      const [value, report] = await Promise.all(responses.map(response => response.json())) as [EvidenceManifest, FundingReport]
      if (value.organizationId !== organizationId || !Array.isArray(value.recipients)) throw new Error('Invalid TEDCO recipient research')
      if (report.companies.length !== value.recipients.length) throw new Error('Incomplete TEDCO funding research')
      if (!controller.signal.aborted) { setManifest(value); setFunding(report) }
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message) })
    return () => controller.abort()
  }, [organizationId])
  useEffect(() => {
    operation.current?.abort(); setPreviews(null); setBusy(false); setApplied(0)
    return () => operation.current?.abort()
  }, [token])
  useEffect(() => { setVisibleCount(50) }, [query, adjacentOnly])
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
  if (!manifest) return message ? <p role="status">{message}</p> : <p>Loading TEDCO recipient research…</p>
  const filtered = new Set(filterEvidenceRecipients(manifest.recipients, query, adjacentOnly).map(row => row.key))
  const recipients = rankRecipients(funding?.companies || []).filter(row => filtered.has(row.key))
  const adjacentCount = manifest.recipients.filter(row => row.tags.includes('LifeTech adjacent')).length
  const otherRegistered = registered.filter(org => !funding?.companies.some(row => row.organizationId === org.id))
  return <div className="tedco-recipient-research">
    <h3>TEDCO recipient funding ranking ({manifest.recipients.length} companies · {adjacentCount} LifeTech adjacent)</h3>
    <p>Highest documented funding first. Rank is across all researched recipients and stays the same when filtered. Unknown amounts follow the ranked organizations.</p>
    <p>{manifest.coverage} Reviewed {manifest.reviewedAt}. Entries without an organization link are researched recipients awaiting directory registration.</p>
    <details><summary>Funding ranking methodology and coverage</summary><p>{funding?.methodology}</p><p>Operating status records activity on the source date. A bought company can continue operating under its acquirer. Missing or unreachable websites do not establish that a company is defunct.</p></details>
    <p><a href={fundingUrl} download>Download funding ranking and company status evidence</a> · <a href={manifestUrl} download>Recipient list and support evidence</a> · <a href={reviewUrl} download>Sources and classification notes</a></p>
    <div className="support-recipient-filters">
      <label>Search researched recipients<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label><input type="checkbox" checked={adjacentOnly} onChange={event => setAdjacentOnly(event.target.checked)} /> LifeTech adjacent only</label>
      <p role="status">Showing {Math.min(visibleCount, recipients.length)} of {recipients.length} matching companies · {manifest.recipients.length} researched recipients overall</p>
    </div>
    <ul className="support-organizations">{recipients.slice(0, visibleCount).map(row => {
      const recipient = manifest.recipients.find(item => item.key === row.key)!
      const org = registered.find(item => item.id === row.organizationId)
      const recipientSlug = org?.slug || row.organizationSlug
      return <li key={row.key}>{recipientSlug ? <Link to={`/orgs/${recipientSlug}`}>{row.name}</Link> : row.name}
        {recipient.tags.includes('LifeTech adjacent') && <span className="support-adjacent-tag">LifeTech adjacent</span>}
        {' '}<a href={recipient.support.sourceUrl} target="_blank" rel="noreferrer">Recipient source</a>
        <CompanyEvidence company={row} />
      </li>
    })}</ul>
    {visibleCount < recipients.length && <button onClick={() => setVisibleCount(count => count + 50)}>Load more recipients ({Math.min(visibleCount, recipients.length)} of {recipients.length})</button>}
    {otherRegistered.length > 0 && <><h4>Other registered descendants · funding unranked</h4><ul className="support-organizations">{otherRegistered.map(org => <li key={org.id}><Link to={`/orgs/${org.slug}`}>{org.name}</Link> · Funding total unknown · Status unknown</li>)}</ul></>}
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
