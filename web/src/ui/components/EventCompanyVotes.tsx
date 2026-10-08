import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowBigDown, ArrowBigUp } from 'lucide-react'
import { useAuth } from '../../app/AppProviders'
import './event-company-votes.css'

type Company = { id: string; name: string; slug: string; image_url: string | null; description: string | null; upvotes: number; downvotes: number; score: number }
type Summary = { available: boolean; closed: boolean; closes_at: string | null; companies: Company[] }

function CompanyImage({ company }: { company: Company }) {
  const [failed, setFailed] = useState(false)
  return <div className="company-vote-image">
    {company.image_url && !failed
      ? <img src={company.image_url} alt={`${company.name} organization image`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : <span aria-hidden="true">{company.name.slice(0, 1)}</span>}
  </div>
}

export function EventCompanyVotes({ eventId }: { eventId: string }) {
  const { token } = useAuth()
  const location = useLocation()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [votes, setVotes] = useState<Record<string, number>>({})
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [retry, setRetry] = useState(0)
  const [clock, setClock] = useState(Date.now())
  const generation = useRef(0)
  const inFlight = useRef(false)
  const base = `/api/org/api/network/events/${encodeURIComponent(eventId)}/company-votes`
  const closed = !!summary?.closed || (!!summary?.closes_at && Date.parse(summary.closes_at) <= clock)

  useEffect(() => {
    const controller = new AbortController()
    generation.current += 1
    inFlight.current = false
    setSummary(null); setVotes({}); setReady(false); setPending(null); setMessage('')
    async function load() {
      try {
        const response = await fetch(`${base}/public`, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('Unable to load company votes. Please retry.')
        const data = await response.json() as Summary
        if (controller.signal.aborted) return
        setSummary(data)
        if (token && data.available) {
          const ownResponse = await fetch(base, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' })
          if (!ownResponse.ok) throw new Error('Unable to load your saved votes. Please retry or sign in again.')
          const own = await ownResponse.json() as { votes: Record<string, number> }
          if (controller.signal.aborted) return
          setVotes(own.votes)
        }
        setClock(Date.now()); setReady(true)
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Unable to load company votes.')
      }
    }
    void load()
    return () => { controller.abort(); generation.current += 1 }
  }, [base, token, retry])

  useEffect(() => {
    if (!summary?.available || closed) return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [summary?.available, closed])

  async function vote(company: Company, direction: number) {
    if (!token || !ready || inFlight.current) return
    const value = votes[company.id] === direction ? 0 : direction
    if (closed && value !== 0) return
    const currentGeneration = generation.current
    inFlight.current = true
    setPending(company.id); setMessage('')
    try {
      const response = await fetch(`${base}/${encodeURIComponent(company.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value }), signal: AbortSignal.timeout(15000),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || data.error || 'Unable to save your vote. Reload votes to check whether it saved.')
      if (currentGeneration !== generation.current) return
      setSummary(data); setClock(Date.now())
      setVotes(previous => ({ ...previous, [company.id]: data.my_vote }))
      setMessage(value === 0 ? `Your vote for ${company.name} was cleared.` : `Your ${value === 1 ? 'upvote' : 'downvote'} for ${company.name} is saved.`)
    } catch (error) {
      if (currentGeneration === generation.current) {
        setReady(false)
        setMessage(error instanceof Error ? error.message : 'Unable to save your vote. Please reload votes.')
      }
    } finally {
      if (currentGeneration === generation.current) { inFlight.current = false; setPending(null) }
    }
  }

  if (summary && !summary.available) return null
  if (!summary && !message) return null
  return <section className="portal-card company-voting" aria-labelledby="company-voting-title">
    <div className="public-event-card-heading">
      <p className="public-event-eyebrow">Community picks</p>
      <h2 id="company-voting-title">Meet the pitching companies</h2>
    </div>
    <p>Upvote or downvote each company. You get one vote per company; select your vote again to clear it. These are community preferences.</p>
    {summary?.closes_at ? <p>{closed ? 'Voting closed' : 'Voting closes'} {new Date(summary.closes_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}.</p> : null}
    {!token && !closed ? <p><Link to={`/users/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Sign in to vote</Link>.</p> : null}
    <ul className="company-vote-list" aria-label="Pitching companies and community votes">
      {summary?.companies.map(company => {
        const own = ready ? votes[company.id] || 0 : 0
        const disabled = !token || !ready || !!pending
        return <li className="company-vote-row" key={company.id}>
          <div className="company-vote-controls" aria-label={`Votes for ${company.name}`}>
            <button type="button" aria-label={`${closed && own === 1 ? 'Clear upvote for' : 'Upvote'} ${company.name}`} aria-pressed={own === 1} disabled={disabled || (closed && own !== 1)} className="company-upvote" onClick={() => void vote(company, 1)}><ArrowBigUp size={24} aria-hidden="true" /></button>
            <strong aria-label={`Score ${company.score}`}>{company.score}</strong>
            <button type="button" aria-label={`${closed && own === -1 ? 'Clear downvote for' : 'Downvote'} ${company.name}`} aria-pressed={own === -1} disabled={disabled || (closed && own !== -1)} className="company-downvote" onClick={() => void vote(company, -1)}><ArrowBigDown size={24} aria-hidden="true" /></button>
          </div>
          <div className="company-vote-details">
            <CompanyImage key={company.image_url} company={company} />
            <h3><Link to={`/orgs/${encodeURIComponent(company.slug)}`}>{company.name}</Link></h3>
            {company.description ? <p className="company-vote-description">{company.description}</p> : null}
            <p className="company-vote-totals">{company.upvotes} upvotes · {company.downvotes} downvotes</p>
            {pending === company.id ? <span role="status">Saving…</span> : null}
          </div>
        </li>
      })}
    </ul>
    <p className="muted">Totals are public. Individual votes are private and expire 90 days after voting closes. You can clear yours at any time.</p>
    {message ? <p role="status">{message}</p> : null}
    <button type="button" disabled={!!pending} onClick={() => setRetry(value => value + 1)}>{ready ? 'Refresh totals' : 'Reload votes'}</button>
  </section>
}
