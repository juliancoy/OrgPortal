import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'

type Phase = 'shortlist' | 'open' | 'closed'
type Result = { submission_id: string; title: string; organization_name: string; votes: number }
type Round = { phase: Phase; finalistIds: string[]; results: Result[] }
type Candidate = Omit<Result, 'votes'> & { favorites: number; status: string }

export function PresentationFinalRound({ eventId, canManage, onPhaseChange, managementOnly = false }: { eventId: string; canManage: boolean; managementOnly?: boolean; onPhaseChange: (phase: Phase) => void }) {
 const { token } = useAuth()
 const location = useLocation()
 const base = `/api/org/api/network/events/${encodeURIComponent(eventId)}/presentations`
 const [round, setRound] = useState<Round | null>(null)
 const [vote, setVote] = useState<string | null>(null)
 const [ballotReady, setBallotReady] = useState(false)
 const [error, setError] = useState('')
 const [pollError, setPollError] = useState('')
 const [busy, setBusy] = useState(false)
 const [message, setMessage] = useState('')
 const [editing, setEditing] = useState(false)
 const [candidates, setCandidates] = useState<Candidate[]>([])
 const [candidatesReady, setCandidatesReady] = useState(false)
 const [selected, setSelected] = useState<string[]>([])
 const [target, setTarget] = useState(6)

 async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(base + path, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Could not update final voting')
  return data
 }
 // Poll only while this tab is mounted, without overlapping requests or background-tab traffic.
 useEffect(() => {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout>
  async function refresh() {
   try {
    if (!document.hidden) {
     const data: Round = await request('/final-round', { signal: controller.signal })
     if (controller.signal.aborted) return
     setRound(data); onPhaseChange(data.phase); setPollError('')
    }
   } catch { if (!controller.signal.aborted) setPollError('Live results are temporarily unavailable. Reconnecting…') }
   finally { if (!controller.signal.aborted) timer = setTimeout(refresh, 3000) }
  }
  void refresh()
  return () => { controller.abort(); clearTimeout(timer) }
 // base, token and callback cover the request's changing inputs.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [base, token, onPhaseChange])
 useEffect(() => {
  const controller = new AbortController()
  setVote(null); setBallotReady(!token)
  if (token) void request('/final-ballot', { signal: controller.signal }).then(data => {
   if (!controller.signal.aborted) { setVote(data.submissionId); setBallotReady(true) }
  }).catch(() => { if (!controller.signal.aborted) setError('Could not load your final vote. Reload before voting.') })
  return () => controller.abort()
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [base, token])
 useEffect(() => {
  if (!editing || !canManage) return
  const controller = new AbortController()
  setCandidatesReady(false); setError('')
  void (async () => {
   const all: Candidate[] = []
   let cursor: string | null = null
   do {
    const data = await request('/submissions' + (cursor ? '?after=' + encodeURIComponent(cursor) : ''), { signal: controller.signal })
    all.push(...data.submissions.filter((row: Candidate) => row.status !== 'declined'))
    cursor = data.next
   } while (cursor && !controller.signal.aborted)
   if (controller.signal.aborted) return
   all.sort((a, b) => b.favorites - a.favorites || a.organization_name.localeCompare(b.organization_name) || a.submission_id.localeCompare(b.submission_id))
   setCandidates(all); setCandidatesReady(true)
   setSelected(round?.finalistIds.length ? round.finalistIds.filter(id => all.some(row => row.submission_id === id)) : all.slice(0, 6).map(row => row.submission_id))
  })().catch(reason => { if (!controller.signal.aborted) setError(reason.message) })
  return () => controller.abort()
 // Preserve the host's unsaved choices when a results refresh arrives.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [editing, canManage, base, token])

 async function saveRound(phase: Phase) {
  setBusy(true); setError(''); setMessage('')
  try {
   await request('/final-round', { method: 'PUT', body: JSON.stringify({ phase, finalistIds: phase === 'shortlist' || round?.phase === 'shortlist' ? selected : round?.finalistIds }) })
   const data: Round = await request('/final-round')
   setRound(data); onPhaseChange(data.phase); setEditing(false)
   setMessage(phase === 'open' ? 'Final voting is open.' : phase === 'closed' ? 'Final voting is closed.' : 'Finalists saved.')
  } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the round') }
  finally { setBusy(false) }
 }
 async function castVote(submissionId: string) {
  setBusy(true); setError(''); setMessage('')
  try {
   const ballot = await request('/final-ballot', { method: 'PUT', body: JSON.stringify({ submissionId }) })
   setVote(ballot.submissionId); setMessage('Your final vote is saved. You can change it while voting is open.')
   const data: Round = await request('/final-round')
   setRound(data); onPhaseChange(data.phase)
  } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save your vote') }
  finally { setBusy(false) }
 }
 if (!round && !managementOnly) return null
 if (!round) return <p role="status">{pollError || 'Loading final round…'}</p>
 if (managementOnly ? !canManage || round.phase !== 'shortlist' : round.phase === 'shortlist') return null
 if (!canManage && !round.finalistIds.length) return null
 const total = round.results.reduce((sum, row) => sum + row.votes, 0)
 const highest = Math.max(0, ...round.results.map(row => row.votes))
 const leaders = round.results.filter(row => row.votes === highest && highest > 0)
 return <section className="presentation-final-round" aria-label="Final presentation vote">
  {round.phase !== 'shortlist' && <h3>Vote for the winner</h3>}
  {round.phase !== 'shortlist' && <p>Choose one presenting team. Your final vote is separate from your preliminary favorites. {round.phase === 'open' ? 'You can change it until the host closes voting.' : 'Voting is closed.'}</p>}
  {canManage && round.phase === 'shortlist' && <button type="button" className="btn-secondary" onClick={() => setEditing(value => !value)}>{editing ? 'Cancel finalist selection' : 'Manage finalists'}</button>}
  {canManage && editing && round.phase === 'shortlist' && <div className="presentation-finalist-editor">
   <label>Number of presenters<input type="number" min={1} max={20} step={1} value={target} onChange={event => setTarget(Number(event.target.value))} /></label>
   <button type="button" className="btn-secondary" disabled={!candidatesReady || busy || !Number.isInteger(target) || target < 1 || target > 20} onClick={() => setSelected(candidates.slice(0, target).map(row => row.submission_id))}>Select top {target || ''} by favorites</button>
   <p>Review ties and adjust the list before opening voting. Opening locks the finalists.</p>
   {!candidatesReady && <p>Loading candidates…</p>}
   <fieldset disabled={busy || !candidatesReady}><legend>Finalists ({selected.length} selected)</legend>
    {candidates.map(row => <label key={row.submission_id} className="presentation-finalist-option"><input type="checkbox" checked={selected.includes(row.submission_id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.submission_id] : previous.filter(id => id !== row.submission_id))} /><span>{row.organization_name} — {row.title} ({row.favorites} favorites)</span></label>)}
   </fieldset>
   <button type="button" className="btn-secondary" disabled={busy || !candidatesReady || selected.length < 1 || selected.length > 20} onClick={() => void saveRound('shortlist')}>Save finalists</button>
   <button type="button" className="btn-primary" disabled={busy || !candidatesReady || selected.length < 1 || selected.length > 20} onClick={() => void saveRound('open')}>Open final voting</button>
  </div>}
  {canManage && round.phase !== 'shortlist' && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void saveRound(round.phase === 'open' ? 'closed' : 'open')}>{round.phase === 'open' ? 'Close final voting' : 'Reopen final voting'}</button>}
  {round.phase === 'shortlist' && round.results.length > 0 && <ul>{round.results.map(row => <li key={row.submission_id}>{row.organization_name} — {row.title}</li>)}</ul>}
  {round.phase !== 'shortlist' && <>
   <p>{total} {total === 1 ? 'vote' : 'votes'} · Updates every 3 seconds.</p>
   <p>{leaders.length === 0 ? 'No votes yet.' : `${leaders.length > 1 ? (round.phase === 'closed' ? 'Tied winners' : 'Tied for the lead') : (round.phase === 'closed' ? 'Winner' : 'Leading')}: ${leaders.map(row => row.organization_name).join(', ')}`}</p>
   {!token && round.phase === 'open' && <p><Link to={`/users/login?next=${encodeURIComponent(location.pathname + location.search + '#submissions')}`}>Sign in</Link> to cast your final vote.</p>}
   <ol className="presentation-results" aria-label="Live final vote results">
    {round.results.map(row => <li key={row.submission_id} className={vote === row.submission_id ? 'is-selected' : ''}>
     <div className="presentation-result-heading"><strong>{row.organization_name}</strong><span>{row.votes} {row.votes === 1 ? 'vote' : 'votes'} ({total ? Math.round(row.votes / total * 100) : 0}%)</span></div>
     <p>{row.title}</p>
     <div className="presentation-result-track" aria-hidden="true"><div style={{ width: `${highest ? row.votes / highest * 100 : 0}%` }} /></div>
     {round.phase === 'open' && token && <button type="button" className="btn-secondary" disabled={busy || !ballotReady} aria-pressed={vote === row.submission_id} onClick={() => void castVote(row.submission_id)}>{vote === row.submission_id ? 'Your vote' : 'Vote'}: {row.organization_name}</button>}
    </li>)}
   </ol>
  </>}
  {message && <p role="status">{message}</p>}
  {pollError && <p role="status">{pollError}</p>}
  {error && <p role="alert">{error}</p>}
 </section>
}
