import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { OnboardingPage } from '../../views/OnboardingPage'
import { InlineProfileField } from './InlineProfileField'

type Availability = { public: boolean; sharing_required?: boolean; slots: string[] }
export function ProfileAvailability({ slug, owner, profilePublic, token }: { slug: string; owner: boolean; profilePublic: boolean; token: string | null }) {
  const [data, setData] = useState<Availability | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const url = `/api/org/api/network/contact/${owner ? 'me' : encodeURIComponent(slug)}/availability`
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError('')
    fetch(url, { signal: controller.signal, cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async response => { if (!response.ok) throw Error('Unable to load availability.'); return response.json() as Promise<Availability> })
      .then(value => { if (!controller.signal.aborted) setData(value) })
      .catch(err => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [url, owner, token, profilePublic, retry])
  if (!owner && (!data?.public || !profilePublic)) return null
  if (!owner && data?.sharing_required) return <section id="profile-availability" className="portal-card" style={{padding:20,marginTop:20}} aria-label="Profile availability">
    <h2>Availability</h2>
    <Link to="/profile#profile-availability">Share your own availability to see this person's availability</Link>
  </section>
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const days = new Map<string, { label: string; ranges: {start: number; end: number}[] }>()
  for (const slot of data?.slots || []) {
    const start = Date.parse(slot)
    if (!Number.isFinite(start)) continue
    const key = new Date(start).toLocaleDateString('en-CA')
    const day = days.get(key) || { label: new Date(start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), ranges: [] }
    const last = day.ranges.at(-1)
    if (last?.end === start) last.end = start + 1800000
    else day.ranges.push({ start, end: start + 1800000 })
    days.set(key, day)
  }
  const time = (value: number) => new Date(value).toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' })
  return <section id="profile-availability" className="portal-card" style={{padding:20,marginTop:20}} aria-label="Profile availability">
    <h2>Availability</h2>
    {owner && data && <><InlineProfileField label="Availability visibility" value={data.public ? 'public' : 'hidden'} options={[{value:'hidden',label:'Hidden'},{value:'public',label:'Public'}]} onSave={async value => {
      const response = await fetch(url, { method:'PUT', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body:JSON.stringify({public:value==='public'}) })
      if (!response.ok) throw Error('Unable to save availability visibility.')
      setData(await response.json())
    }}><span>{data.public ? 'Public' : 'Hidden'}</span></InlineProfileField><p className="muted">{!data.public ? 'Only you can see your availability here.' : !profilePublic ? 'Availability is hidden while your profile is private.' : 'People who have shared their own availability can see your saved availability for the next 30 days.'}</p></>}
    {owner && <OnboardingPage availabilityOnly />}
    {error ? <p role="status">{error} <button type="button" onClick={()=>setRetry(value=>value+1)}>Retry</button></p> : owner ? null : !data ? <p className="muted">Loading availability…</p> : <><p className="muted">Next 30 days · Times in {timezone}</p>{days.size ? <dl>{[...days].map(([key,day])=><div key={key} style={{marginBottom:12}}><dt><strong>{day.label}</strong></dt><dd style={{marginLeft:0}}>{day.ranges.map(range=>`${time(range.start)}–${time(range.end)}`).join(', ')}</dd></div>)}</dl> : <p className="muted">No upcoming availability has been saved.</p>}</>}
  </section>
}
