import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { publicProfileUrl } from '../../config/portalBase'
import { NametagCard } from '../components/ConferenceNametag'
import { printNametags } from '../utils/printNametags'
import badgeStyles from '../components/ConferenceNametag.css?inline'
import sheetStyles from './nametags.css?inline'
import './nametags.css'

type Person = { user_id: string; name: string; slug: string; avatar_url: string; public: boolean }

export function NametagsPage() {
  const { token } = useAuth()
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [printing, setPrinting] = useState(false)
  const sheetsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setPeople([]); setError('')
    async function load() {
      if (!token) throw new Error('Sign in as an administrator to print nametags.')
      const all: Person[] = []
      let cursor: string | null = null
      do {
        const params = new URLSearchParams({ limit: '500', ...(cursor ? { cursor } : {}) })
        const response = await fetch(`/api/org/admin/nametags?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
        if (!response.ok) throw new Error(response.status === 403 ? 'Administrator access is required.' : 'Could not load nametags. Please reload to try again.')
        const data = await response.json() as { people: Person[]; next_cursor: string | null }
        all.push(...data.people)
        cursor = data.next_cursor
      } while (cursor)
      if (!controller.signal.aborted) setPeople(all.sort((a, b) => a.name.localeCompare(b.name) || a.user_id.localeCompare(b.user_id)))
    }
    void load().catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load nametags.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token])
  const sheets = Array.from({ length: Math.ceil(people.length / 6) }, (_, index) => people.slice(index * 6, index * 6 + 6))
  return <section className="panel nametags-page">
    <div className="nametags-controls">
      <Link to="/admin">Back to admin</Link>
      <h1>Print everyone’s nametags</h1>
      <p>Six 4 × 3 inch nametags per 8.5 × 11 inch sheet. Print at 100% / actual size with browser headers and footers turned off.</p>
      {loading ? <p role="status">Loading all people…</p> : <p>{people.length} people · {sheets.length} printable sheets</p>}
      {people.some(person => !person.public) && <p className="muted">Private profiles are included; their QR links will not show private profiles to visitors.</p>}
      <button disabled={loading || !people.length || printing} onClick={async () => {
        if (!sheetsRef.current) return
        setPrinting(true); setError('')
        try { await printNametags(sheetsRef.current, `${badgeStyles}\n${sheetStyles}\n@page { size: letter portrait; margin: .25in; } body { margin: 0; } .nametag-letter-sheet { margin: 0; }`, 'LifeTech nametags — Letter sheets') }
        catch { setError('Could not open printing. Please try again.') }
        finally { setPrinting(false) }
      }}>{printing ? 'Preparing…' : 'Print all nametags'}</button>
      {error && <p role="alert">{error}</p>}
      {!loading && !error && !people.length && <p>No people with profiles are available yet.</p>}
    </div>
    <div className="nametag-sheet-preview">
      <div ref={sheetsRef} className="nametag-sheets">
        {sheets.map((sheet, index) => <div className="nametag-letter-sheet" key={index} aria-label={`Letter sheet ${index + 1}`}>
          {sheet.map(person => <NametagCard key={person.user_id} name={person.name} avatarUrl={person.avatar_url} publicPageUrl={publicProfileUrl(person.slug)} />)}
        </div>)}
      </div>
    </div>
  </section>
}
