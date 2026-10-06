import { useState } from 'react'
import { useAuth } from '../../app/AppProviders'

type Preview = { before: string; slug: string; publicUrl: string; previewId: string }
export function EventSlugEditor({ eventId, slug, onSaved }: { eventId: string; slug: string; onSaved: () => void }) {
  const { token } = useAuth()
  const [draft, setDraft] = useState(slug)
  const [series, setSeries] = useState(slug.replace(/-\d+$/, ''))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  async function request(path: string, body?: unknown) {
    const response = await fetch(`/api/org/api/network/events/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to update event link')
    return result
  }
  async function act(action: 'next' | 'preview' | 'apply') {
    setBusy(true); setStatus('')
    try {
      if (action === 'next') { setDraft((await request(`next-slug?series=${encodeURIComponent(series)}`)).slug); setPreview(null) }
      else if (action === 'preview') setPreview(await request(`${encodeURIComponent(eventId)}/slug`, { slug: draft }))
      else if (preview) { await request(`${encodeURIComponent(eventId)}/slug`, { slug: preview.slug, previewId: preview.previewId, confirm: true }); setPreview(null); setStatus('Event link updated.'); onSaved() }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to update event link') }
    finally { setBusy(false) }
  }
  return <details className="portal-card" style={{ padding: '.75rem' }}>
    <summary>Event link &amp; numbering</summary>
    <div style={{ display: 'grid', gap: '.6rem', marginTop: '.75rem' }}>
      <label>Event series<input value={series} onChange={event => { setSeries(event.target.value); setPreview(null) }} placeholder="lifetech-social" /></label>
      <button type="button" disabled={busy || !series} onClick={() => void act('next')}>Use next event number</button>
      <label>URL slug<input value={draft} onChange={event => { setDraft(event.target.value); setPreview(null) }} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
      <button type="button" disabled={busy || !draft || draft === slug} onClick={() => void act('preview')}>Preview new link</button>
      {preview ? <div><p><code>/events/{preview.before}</code> → <code>{preview.publicUrl}</code></p><button type="button" disabled={busy} onClick={() => void act('apply')}>Apply new link</button></div> : null}
      {status ? <p role="status">{status}</p> : null}
    </div>
  </details>
}
