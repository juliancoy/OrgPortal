import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import './organization-support.css'
import {supportEventLinks} from './supportEventLinks'
import { TedcoRecipientResearch } from './TedcoRecipientResearch'
import { TedcoCompanyEvidence } from './TedcoCompanyEvidence'

export type SupportRecord = {
  id: string; record_id: string; record_type: string; timestamp: string; occurred_at: string
  transaction_type: string; amount: number | null; currency: string | null; amount_label: string
  quantity: number | null; unit: string | null; description: string; from_label: string | null; to_label: string | null
  from_organization_id: string | null; to_organization_id: string | null
  from_organization_slug: string | null; to_organization_slug: string | null
  status: string; void_reason: string | null; source_url: string; evidence: string; notes: string; provenance_json: string
}
type Organization = { id: string; name: string; slug: string; is_direct?: number; tags?: string[] }
type FinancialTotal = { direction: 'deployed' | 'received'; currency: string | null; status: 'reported' | 'delivered'; amount: number | null; recordCount: number; undisclosedCount: number }
type Support = { financialTotals: { source: string; entries: FinancialTotal[] }; descendants: Organization[]; supporters: Organization[]; records: SupportRecord[]; recordCount: number; nextRecordOffset: number | null }
const kinds = {
  transfer: 'Monetary support / award', in_kind: 'In-kind contribution', mentoring: 'Mentoring', venue: 'Venue support',
  services: 'Services', incubation: 'Incubation', acceleration: 'Acceleration', collaboration: 'Collaboration',
  terms: 'Program terms', capitalization: 'Fund capitalization', portfolio: 'Portfolio aggregate', coinvestment: 'Co-investment aggregate', affiliation: 'Affiliation',
}
const moneyKinds = new Set(['transfer', 'terms', 'capitalization', 'portfolio', 'coinvestment'])
export function supportAmount(record: SupportRecord) {
  if (record.quantity !== null) return `${record.quantity.toLocaleString()} ${record.unit || ''}`
  if (record.amount_label) return record.amount_label
  if (record.amount !== null) return `${record.amount.toLocaleString()} ${record.currency || ''}`
  return moneyKinds.has(record.transaction_type) ? 'Undisclosed' : 'Nonmonetary'
}
function provenanceLabels(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap(item => item && typeof item === 'object' && 'sheet' in item
      ? [[item.source, item.sheet, item.row ? `row ${item.row}` : '', item.snapshot ? `snapshot ${String(item.snapshot).slice(0, 10)}` : ''].filter(Boolean).join(' · ')] : [])
  } catch { return [] }
}
export function SupportRecordTable({ records }: { records: SupportRecord[] }) {
  return <div className="support-table-scroll"><table className="finance-table support-table">
    <caption>Contribution records and evidence. Awards and commitments do not establish cash disbursement; source amounts may overlap.</caption>
    <thead><tr><th>From → recipient</th><th>Support</th><th>Amount / quantity</th><th>Period & status</th><th>Evidence</th></tr></thead>
    <tbody>{records.map(record => <tr key={record.id}>
      <td>{record.from_organization_slug ? <Link to={`/orgs/${record.from_organization_slug}`}>{record.from_label}</Link> : record.from_label || 'System'}<br />→ {record.to_organization_slug ? <Link to={`/orgs/${record.to_organization_slug}`}>{record.to_label}</Link> : record.to_label || 'System'}</td>
      <td>{kinds[record.transaction_type as keyof typeof kinds] || record.transaction_type}<small>{record.description}</small>{supportEventLinks(record.provenance_json).map(event=><small key={event.id}><a href={event.url}>View event: {event.title}</a></small>)}</td>
      <td>{supportAmount(record)}</td>
      <td>{record.occurred_at || record.timestamp}<small>{record.status === 'settled' ? 'Portal settlement' : record.status === 'reported' ? 'Reported support' : record.status}</small></td>
      <td>{record.source_url ? <a href={record.source_url} target="_blank" rel="noreferrer">View source</a> : 'Portal ledger'}<small>{record.evidence}</small><small>{record.notes}</small>{provenanceLabels(record.provenance_json).map((label, index) => <small key={index}>{label}</small>)}{record.void_reason && <small>Correction: {record.void_reason}</small>}</td>
    </tr>)}</tbody>
  </table></div>
}
const emptyForm = { recipientOrganizationId: '', supportKind: 'transfer', amount: '', currency: 'USD', quantity: '', unit: '', description: '', occurredAt: '', sourceUrl: '', evidence: '', notes: '', status: 'reported' }

export function OrganizationSupport({ organizationId, slug, canManage }: { organizationId: string; slug: string; canManage: boolean }) {
  const { token } = useAuth()
  const [data, setData] = useState<Support | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [form, setForm] = useState(emptyForm)
  const [preview, setPreview] = useState<{ previewId: string; expiresAt: string; changes: Record<string, unknown> } | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [recipientSearch, setRecipientSearch] = useState('')
  const [adjacentOnly, setAdjacentOnly] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const recordRequest = useRef<AbortController | null>(null)
  const adjacent = (org: Organization) => org.tags?.includes('LifeTech adjacent') || false
  const descendants = (data?.descendants || []).filter(org => (!adjacentOnly || adjacent(org)) && org.name.toLocaleLowerCase().includes(recipientSearch.trim().toLocaleLowerCase()))
  const prefix = `/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/support`
  useEffect(() => {
    const controller = new AbortController()
    recordRequest.current?.abort()
    setBusy(false)
    setData(null)
    setPreview(null)
    setForm(emptyForm)
    setMessage('')
    setRecipientSearch('')
    setAdjacentOnly(false)
    fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(slug)}/support`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Unable to load organizational support'); const result = await response.json()
        if (!Array.isArray(result.descendants) || !Array.isArray(result.supporters) || !Array.isArray(result.records) || !Number.isInteger(result.recordCount) || (result.nextRecordOffset !== null && !Number.isInteger(result.nextRecordOffset))) throw new Error('Unable to load organizational support')
        return result as Support })
      .then(setData).catch(error => { if (!controller.signal.aborted) setMessage(error.message) })
    return () => { controller.abort(); recordRequest.current?.abort() }
  }, [slug, refresh])
  useEffect(() => {
    if (!canManage || !token) { setPreview(null); return }
    const controller = new AbortController()
    ;(async () => {
      const all: Organization[] = []
      for (let offset = 0; ; offset += 500) {
        const response = await fetch(`/api/org/api/network/orgs/public?limit=500&offset=${offset}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Unable to load recipient organizations')
        const page = await response.json() as Organization[]
        if (!Array.isArray(page)) throw new Error('Unable to load recipient organizations')
        all.push(...page)
        if (page.length < 500) return all
      }
    })()
      .then(setOrganizations).catch(error => { if (!controller.signal.aborted) setMessage(error.message) })
    return () => controller.abort()
  }, [canManage, token])
  async function loadMoreRecords() {
    if (!data || data.nextRecordOffset === null) return
    const controller = new AbortController(); recordRequest.current = controller
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(slug)}/support?offset=${data.nextRecordOffset}`, { signal: controller.signal })
      if (!response.ok) throw new Error('Unable to load more source evidence')
      const page = await response.json() as Support
      if (!Array.isArray(page.records) || (page.nextRecordOffset !== null && (!Number.isInteger(page.nextRecordOffset) || page.nextRecordOffset <= data.nextRecordOffset))) throw new Error('Incomplete source evidence page')
      if (controller.signal.aborted) return
      setData(current => current ? { ...page, records: [...new Map([...current.records, ...page.records].map(record => [record.id, record])).values()] } : current)
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Unable to load more source evidence') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    setBusy(true); setMessage('')
    const monetary = moneyKinds.has(form.supportKind)
    const changes = preview?.changes || { ...form, amount: monetary && form.amount ? Number(form.amount) : null, currency: monetary && form.amount ? form.currency : null,
      quantity: !monetary && form.quantity ? Number(form.quantity) : null, unit: !monetary && form.quantity ? form.unit : null }
    try {
      const response = await fetch(`${prefix}/record`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...changes, ...(preview ? { confirm: true, previewId: preview.previewId } : { confirm: false }) }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Unable to record support')
      if (preview) { setData(result.result); setPreview(null); setForm(emptyForm); setMessage('Support recorded in the master transaction record.') }
      else setPreview(result)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to record support'); setPreview(null) }
    finally { setBusy(false) }
  }
  return <section className="portal-card organization-support" aria-label="Organization support and descendants">
    {slug !== 'tedco' && <TedcoCompanyEvidence organizationId={organizationId} />}
    {data && <div aria-label="Documented financial totals">
      <h2>Documented deployed and received</h2>
      <p className="muted">Calculated from the shared master transaction database. Delivered support is separate from reported awards and commitments. Currencies are not combined; program limits, fund capitalization, portfolio totals and nonmonetary support are excluded.</p>
      <div className="support-table-scroll"><table className="finance-table"><caption>Public organization monetary support across all dates. These totals do not establish complete lifetime funding or account balances.</caption>
        <thead><tr><th>Direction</th><th>Documented delivered</th><th>Reported / announced</th></tr></thead>
        <tbody>{(['deployed', 'received'] as const).map(direction => <tr key={direction}><th>{direction === 'deployed' ? 'Deployed' : 'Received'}</th>{(['delivered', 'reported'] as const).map(status => {
          const entries = data.financialTotals.entries.filter(entry => entry.direction === direction && entry.status === status)
          return <td key={status}>{entries.length ? entries.map(entry => <div key={entry.currency || 'undisclosed'}>{entry.amount !== null && <strong>{entry.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {entry.currency}</strong>}{entry.undisclosedCount > 0 && <small>{entry.undisclosedCount} record(s) with undisclosed amounts</small>}<small>{entry.recordCount} source record(s)</small></div>) : 'No documented monetary records'}</td>
        })}</tr>)}</tbody>
      </table></div>
    </div>}
    <h2>Descendant organizations</h2>
    <p className="muted">Organizations supported with funding, resources, time, or services. Indirect descendants are reached through another supported organization.</p>
    {<TedcoRecipientResearch organizationId={organizationId} registered={data?.descendants || []} onImported={() => setRefresh(value => value + 1)} />}
    {data ? <>
      {slug !== 'tedco' && data.descendants.length > 0 && <div className="support-recipient-filters">
        <label>Find a supported organization<input type="search" value={recipientSearch} onChange={event => setRecipientSearch(event.target.value)} /></label>
        <label><input type="checkbox" checked={adjacentOnly} onChange={event => setAdjacentOnly(event.target.checked)} /> LifeTech adjacent ({data.descendants.filter(adjacent).length})</label>
        <p role="status">Showing {descendants.length} of {data.descendants.length} supported organizations</p>
      </div>}
      {slug !== 'tedco' && (data.descendants.length ? descendants.length ? <ul className="support-organizations">{descendants.map(org => <li key={org.id}><Link to={`/orgs/${org.slug}`}>{org.name}</Link> <small>{org.is_direct ? 'Direct support' : 'Indirect descendant'}</small>{adjacent(org) && <span className="support-adjacent-tag">LifeTech adjacent</span>}</li>)}</ul> : <p>No supported organizations match these filters.</p> : <p>No documented descendant organizations yet.</p>)}
      <h3>Supported by</h3>
      {data.supporters.length ? <ul className="support-organizations">{data.supporters.map(org => <li key={org.id}><Link to={`/orgs/${org.slug}`}>{org.name}</Link></li>)}</ul> : <p>No documented supporters yet.</p>}
      <details><summary>Support records and source evidence ({data.recordCount})</summary>{data.records.length ? <SupportRecordTable records={data.records} /> : <p>No support records yet.</p>}{data.nextRecordOffset !== null && <button disabled={busy} onClick={() => void loadMoreRecords()}>Load more source evidence ({data.records.length} of {data.recordCount})</button>}</details>
    </> : !message && <p role="status">Loading support records…</p>}
    {canManage && token && <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary>Record organizational support</summary>
      <form onSubmit={event => void submit(event)} className="support-form">
        <fieldset disabled={busy || Boolean(preview)}><legend>Contribution details</legend>
          <label>Recipient organization<select required value={form.recipientOrganizationId} onChange={event => setForm({ ...form, recipientOrganizationId: event.target.value })}><option value="">Choose an organization</option>{organizations.filter(org => org.id !== organizationId).map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
          <label>Type of support<select value={form.supportKind} onChange={event => setForm({ ...form, supportKind: event.target.value })}>{Object.entries(kinds).filter(([key]) => key !== 'affiliation').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {moneyKinds.has(form.supportKind) ? <>
            <label>Amount (leave blank if undisclosed)<input type="number" min="0.000001" step="any" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></label>
            <label>Currency<input required={Boolean(form.amount)} pattern="[A-Z]{3}" maxLength={3} value={form.currency} onChange={event => setForm({ ...form, currency: event.target.value.toUpperCase() })} /></label>
          </> : <>
            <label>Quantity (optional)<input type="number" min="0.000001" step="any" value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })} /></label>
            <label>Unit<input required={Boolean(form.quantity)} value={form.unit} placeholder="hours, meals, room-days…" onChange={event => setForm({ ...form, unit: event.target.value })} /></label>
          </>}
          <label>Description<textarea required maxLength={5000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
          <label>Date or period<input required maxLength={200} value={form.occurredAt} placeholder="2026-10-04 or Fall 2026" onChange={event => setForm({ ...form, occurredAt: event.target.value })} /></label>
          <label>Public evidence URL<input required type="url" maxLength={2000} value={form.sourceUrl} onChange={event => setForm({ ...form, sourceUrl: event.target.value })} /></label>
          <label>Evidence description<input required maxLength={2000} value={form.evidence} onChange={event => setForm({ ...form, evidence: event.target.value })} /></label>
          <label>Notes<textarea maxLength={5000} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>
          <label>Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="reported">Reported / announced</option><option value="delivered">Delivered (documented by source)</option></select></label>
        </fieldset>
        {preview && <div className="support-preview" role="region" aria-label="Review support record">
          <h3>Review support record</h3>
          <p>{organizations.find(org => org.id === form.recipientOrganizationId)?.name} · {kinds[form.supportKind as keyof typeof kinds]} · {form.amount ? `${form.amount} ${form.currency}` : form.quantity ? `${form.quantity} ${form.unit}` : 'Amount / quantity unspecified'}</p>
          <p>{form.description} · {form.occurredAt} · {form.status}</p>
          <p><a href={form.sourceUrl} target="_blank" rel="noreferrer">View evidence</a> · {form.evidence}</p>
          <p>This record will be public. It records support and does not send a payment. Review expires {new Date(preview.expiresAt).toLocaleTimeString()}.</p>
          <button type="button" disabled={busy} onClick={() => setPreview(null)}>Back to editing</button>
        </div>}
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Working…' : preview ? 'Confirm and record support' : 'Preview support record'}</button>
      </form>
    </details>}
    {message && <p role="status">{message}</p>}
  </section>
}
