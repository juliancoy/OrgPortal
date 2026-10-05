import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { applyEvidenceImport, filterEvidenceRecipients, previewEvidenceImport, type EvidenceManifest, type EvidencePreview } from './organizationEvidenceImport'
import manifestUrl from '../../data/tedco-recipients.json?url'
import reviewUrl from '../../data/tedco-recipient-review.json?url'

export function TedcoRecipientResearch({ organizationId, registered, onImported }: {
  organizationId: string; registered: { id: string; name: string; slug: string }[]; onImported: () => void
}) {
  const { token } = useAuth()
  const [manifest, setManifest] = useState<EvidenceManifest | null>(null)
  const [query, setQuery] = useState('')
  const [adjacentOnly, setAdjacentOnly] = useState(false)
  const [previews, setPreviews] = useState<EvidencePreview[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [applied, setApplied] = useState(0)
  const operation = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(manifestUrl, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Unable to load TEDCO recipient research')
      const value = await response.json() as EvidenceManifest
      if (value.organizationId !== organizationId || !Array.isArray(value.recipients)) throw new Error('Invalid TEDCO recipient research')
      setManifest(value)
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message) })
    return () => controller.abort()
  }, [organizationId])
  useEffect(() => {
    operation.current?.abort(); setPreviews(null); setBusy(false); setApplied(0)
    return () => operation.current?.abort()
  }, [token])
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
  const recipients = filterEvidenceRecipients(manifest.recipients, query, adjacentOnly)
  const adjacentCount = manifest.recipients.filter(row => row.tags.includes('LifeTech adjacent')).length
  return <details className="tedco-recipient-research">
    <summary>TEDCO recipient research ({manifest.recipients.length} companies · {adjacentCount} LifeTech adjacent)</summary>
    <p>{manifest.coverage} Reviewed {manifest.reviewedAt}. This research includes all sectors and historical recipients. The directory and support records above reflect registered organizations.</p>
    <p><a href={manifestUrl} download>Download recipient list and support evidence</a> · <a href={reviewUrl} download>Sources, identity matches, and classification notes</a></p>
    <div className="support-recipient-filters">
      <label>Search researched recipients<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label><input type="checkbox" checked={adjacentOnly} onChange={event => setAdjacentOnly(event.target.checked)} /> LifeTech adjacent only</label>
      <p role="status">Showing {recipients.length} of {manifest.recipients.length} researched companies</p>
    </div>
    <ul className="support-organizations">{recipients.map(row => {
      const org = registered.find(item => item.id === row.existingOrganizationId || item.name === row.name)
      return <li key={row.key}>{org ? <Link to={`/orgs/${org.slug}`}>{row.name}</Link> : row.name}
        {row.tags.includes('LifeTech adjacent') && <span className="support-adjacent-tag">LifeTech adjacent</span>}
        {' '}<a href={row.support.sourceUrl} target="_blank" rel="noreferrer">Source</a>
        <small className="research-company-detail">{row.description} {row.support.occurredAt}</small>
      </li>
    })}</ul>
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
  </details>
}
