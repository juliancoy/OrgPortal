import { useCallback, useEffect, useRef, useState } from 'react'
import { useTimebankApi } from '../../timebank/useTimebankApi'

type Account = { id: string; name: string; source_slug: string; source_name: string; claimed: number; claimed_by_me: number }
type Claim = { id: string; account_id: string; name?: string; account_name?: string; status: string; evidence: string; review_note: string | null; claimant_name?: string; claimant_email?: string; source_profile_url?: string }
type Directory = { accounts: Account[]; claims: Claim[] }
type Imported = {
  account: { name: string; source_name: string; balance_minutes: number | null; captured_at: string; profile: { text?: string } } | null
  records: { id: string; kind: string; title: string; source_url: string; relationship: string; detail: { text?: string; minutes?: number | null; status?: string; date_display?: string; activity_type?: string } }[]
}
type Review = { claims: Claim[]; batches: { source_name: string; account_count: number; known_balances: number; claimed_accounts: number; record_count: number }[] }
const hours = (minutes: number) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(minutes / 60)} h`
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Unable to load imported accounts. Please try again.'

export function TimebankClaims({ onChanged }: { onChanged: () => Promise<unknown> }) {
  const api = useTimebankApi()
  const [query, setQuery] = useState('')
  const [data, setData] = useState<Directory | null>(null)
  const [mine, setMine] = useState<Imported | null>(null)
  const [selected, setSelected] = useState<Account | null>(null)
  const [evidence, setEvidence] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const requestId = useRef(crypto.randomUUID())
  const load = useCallback(async (signal?: AbortSignal) => {
    const [directory, records] = await Promise.all([
      api<Directory>(`/imports/accounts?q=${encodeURIComponent(query)}`, { signal }),
      api<Imported>('/imports/me', { signal }),
    ])
    if (!signal?.aborted) { setData(directory); setMine(records) }
  }, [api, query])
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).catch((err: unknown) => { if (!controller.signal.aborted) setError(errorText(err)) })
    return () => controller.abort()
  }, [load])
  async function mutate(path: string, body: unknown, success: string) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(''); setMessage('')
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) })
      setSelected(null); setEvidence(''); requestId.current = crypto.randomUUID()
      await load(); await onChanged(); setMessage(success)
    } catch (err) { setError(errorText(err)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const pending = data?.claims.find((claim) => claim.status === 'pending')
  return <section className="tb-imports" aria-labelledby="tb-claim-title">
    <div className="tb-import-heading"><h2 id="tb-claim-title">Your LetsBMore records</h2><button className="tb-text-button" disabled={busy} onClick={() => { setError(''); void load().then(onChanged).catch((err: unknown) => setError(errorText(err))) }}>Refresh claims</button></div>
    {error && <p role="alert" className="tb-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!data && !error && <p role="status">Loading accounts…</p>}
    {mine?.account ? <>
      <p>Your claim for <strong>{mine.account.name}</strong> is approved. These records are now attached to your signed-in account.</p>
      <div className="tb-quiet"><strong>Opening balance: {mine.account.balance_minutes === null ? 'Not recorded in the source' : hours(mine.account.balance_minutes)}</strong><p>Captured from {mine.account.source_name} on {new Date(mine.account.captured_at).toLocaleDateString()}. Historical transactions are already included in this balance. New confirmed exchanges adjust it once.</p></div>
      {mine.account.profile.text && <details className="tb-import-record"><summary>Imported profile</summary><p className="tb-description">{mine.account.profile.text}</p></details>}
      {(['transaction', 'activity'] as const).map((kind) => <section key={kind} aria-label={kind === 'transaction' ? 'Imported transactions' : 'Imported listings'}>
        <h3>{kind === 'transaction' ? 'Historical transactions' : 'Imported listings'} ({mine.records.filter((record) => record.kind === kind).length})</h3>
        {mine.records.filter((record) => record.kind === kind).map((record) => <details className="tb-import-record" key={record.id}>
          <summary>{record.title}{typeof record.detail.minutes === 'number' ? ` · ${hours(record.detail.minutes)}` : ''}</summary>
          <p className="tb-muted">{record.detail.status || record.detail.activity_type}{record.detail.date_display ? ` · ${record.detail.date_display}` : ''}{kind === 'transaction' ? ' · Historical record; no new hours moved' : ' · Archived listing'}</p>
          <p className="tb-description">{record.detail.text}</p>
        </details>)}
        {kind === 'transaction' && !mine.records.some((record) => record.kind === kind) && <p className="tb-muted">No detailed transactions for this account were available in the source archive. Its recorded balance is preserved.</p>}
      </section>)}
    </> : <>
      <p>Find your former profile and request a claim. A community administrator will verify that it belongs to you before attaching its hours and private records.</p>
      {pending && <div className="tb-quiet" role="status"><strong>Claim pending: {pending.name}</strong><p>An administrator is reviewing your request.</p><button className="tb-text-button" disabled={busy} onClick={() => { void mutate(`/imports/claims/${pending.id}/withdraw`, {}, 'Claim withdrawn. You can select another account.') }}>Withdraw claim</button></div>}
      {selected && !pending ? <form className="tb-form tb-claim-form" onSubmit={(event) => { event.preventDefault(); void mutate('/imports/claims', { id: requestId.current, account_id: selected.id, evidence }, 'Claim submitted for administrator review.') }}>
        <h3>Claim {selected.name}</h3><p>Former handle: {selected.source_slug}</p>
        <label>How can the community confirm this is you?<textarea required maxLength={1000} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="For example, your former member email or a coordinator who knows you. Do not enter passwords." /></label>
        <div className="tb-actions"><button className="tb-button" disabled={busy} type="submit">{busy ? 'Submitting…' : 'Submit claim'}</button><button className="tb-text-button" disabled={busy} type="button" onClick={() => setSelected(null)}>Cancel</button></div>
      </form> : !pending && <>
        <label className="tb-import-search" htmlFor="tb-import-search">Find your LetsBMore account<input id="tb-import-search" type="search" maxLength={100} value={query} onChange={(event) => { setQuery(event.target.value); setError('') }} placeholder="Name or former handle" /></label>
        <ul className="tb-claim-list">{data?.accounts.map((account) => <li key={account.id}><div><strong>{account.name}</strong><span>{account.source_slug}</span></div>{account.claimed ? <span>Already claimed</span> : <button className="tb-button tb-secondary" disabled={busy} onClick={() => { setSelected(account); setEvidence(''); requestId.current = crypto.randomUUID() }} aria-label={`Claim ${account.name}`}>Claim account</button>}</li>)}</ul>
        {data && !data.accounts.length && <p className="tb-quiet">No matching account found.</p>}
      </>}
      {data?.claims.filter((claim) => claim.status !== 'pending').map((claim) => <p key={claim.id} className="tb-muted">{claim.name}: {claim.status}{claim.review_note ? ` — ${claim.review_note}` : ''}</p>)}
    </>}
  </section>
}

export function TimebankClaimReview() {
  const api = useTimebankApi()
  const [data, setData] = useState<Review | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await api<Review>('/imports/review', { signal })
    if (!signal?.aborted) setData(result)
  }, [api])
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).catch((err: unknown) => { if (!controller.signal.aborted) setError(errorText(err)) })
    return () => controller.abort()
  }, [load])
  async function review(claim: Claim, status: 'approved' | 'rejected') {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(''); setMessage('')
    try {
      await api(`/imports/claims/${claim.id}`, { method: 'PATCH', body: JSON.stringify({ status, review_note: notes[claim.id] }) })
      await load(); setMessage(`Claim ${status}.`)
    } catch (err) { setError(errorText(err)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <section className="tb-imports" aria-label="Account claim review">
    <div className="tb-import-heading"><h2>Account claims</h2><button className="tb-text-button" disabled={busy} onClick={() => { void load().catch((err: unknown) => setError(errorText(err))) }}>Refresh claim review</button></div>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {data?.batches.map((batch) => <p key={batch.source_name}>{batch.source_name}: {batch.claimed_accounts} of {batch.account_count} accounts claimed · {batch.known_balances} known balances · {batch.record_count} archived records</p>)}
    <p className="tb-muted">Verify the member’s identity with the timebank coordinator before approving. Approval attaches the recorded balance and private history.</p>
    {data?.claims.filter((claim) => claim.status === 'pending').map((claim) => <article className="tb-claim-review tb-form" key={claim.id} aria-label={`Claim by ${claim.claimant_name}`}>
      <h3>{claim.claimant_name} → {claim.account_name}</h3><p>{claim.claimant_email}</p><p className="tb-description">{claim.evidence}</p>
      {claim.source_profile_url && <a href={claim.source_profile_url} target="_blank" rel="noreferrer">View former profile</a>}
      <label>Verification or rejection reason<textarea maxLength={1000} value={notes[claim.id] || ''} onChange={(event) => setNotes({ ...notes, [claim.id]: event.target.value })} /></label>
      <div className="tb-actions"><button className="tb-button" disabled={busy || !notes[claim.id]?.trim()} onClick={() => { void review(claim, 'approved') }}>Approve claim</button><button className="tb-text-button" disabled={busy || !notes[claim.id]?.trim()} onClick={() => { void review(claim, 'rejected') }}>Reject claim</button></div>
    </article>)}
    {data && !data.claims.some((claim) => claim.status === 'pending') && <p className="tb-quiet">No claims awaiting review.</p>}
  </section>
}
