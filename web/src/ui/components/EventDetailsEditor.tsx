import { useState, type FormEvent } from 'react'
import { toUserFacingErrorMessage } from '../../infrastructure/http/userFacingError'

export type EditableEvent = {
  id: string
  title: string
  description?: string | null
  image_url?: string | null
  location?: string | null
  event_date?: string | null
  timezone?: string | null
  starts_at?: string | null
  ends_at?: string | null
}

function localDateTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function EventDetailsEditor({ event, token, onSaved, onCancel }: {
  event: EditableEvent
  token: string
  onSaved: (event: EditableEvent) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(event.title)
  const [description, setDescription] = useState(event.description || '')
  const [imageUrl, setImageUrl] = useState(event.image_url || '')
  const [location, setLocation] = useState(event.location || '')
  const [eventDate, setEventDate] = useState(event.event_date || '')
  const [timezone, setTimezone] = useState(event.timezone || 'America/New_York')
  const [start, setStart] = useState(localDateTime(event.starts_at))
  const [end, setEnd] = useState(localDateTime(event.ends_at))
  const [image, setImage] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endpoint = `/api/org/api/network/events/${encodeURIComponent(event.id)}`

  async function readResponse(response: Response) {
    const data = await response.json()
    if (!response.ok) throw new Error(data.detail || data.error || 'Unable to save event')
    return data
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (end && (!start || new Date(end) < new Date(start))) {
      setError('Set a start time before the end time.')
      return
    }
    setBusy(true)
    setError('')
    try {
      let nextImageUrl = imageUrl.trim() || null
      if (image) {
        const form = new FormData()
        form.set('image', image)
        const uploaded = await readResponse(await fetch(`${endpoint}/media`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
        }))
        const url = uploaded.media?.at(-1)?.url
        if (!url) throw new Error('The uploaded image is unavailable.')
        nextImageUrl = new URL(url.startsWith('/api/network/') ? `/api/org${url}` : url, window.location.origin).href
        setImageUrl(nextImageUrl)
        setImage(null)
      }
      const updated = await readResponse(await fetch(endpoint, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null,
          image_url: nextImageUrl, location: location.trim() || null,
          event_date: eventDate || null, timezone,
          starts_at: start ? new Date(start).toISOString() : null,
          ends_at: end ? new Date(end).toISOString() : null }),
      }))
      onSaved(updated)
    } catch (err) {
      setError(toUserFacingErrorMessage(err, 'Unable to save event'))
    } finally { setBusy(false) }
  }

  return <form id="event-details-editor" className="portal-card public-event-editor" onSubmit={e => void save(e)}>
    <h2>Edit event</h2>
    <fieldset disabled={busy}>
      <label>Title<input autoFocus required maxLength={500} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label>Description<textarea value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label>Image URL<input type="url" value={imageUrl} onChange={e => { setImageUrl(e.target.value); setImage(null) }} /></label>
      <label>Upload image<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => {
        const file = e.target.files?.[0] || null
        if (file && file.size > 8 * 1024 * 1024) { setError('Image exceeds 8 MB.'); e.target.value = ''; return }
        setImage(file); setError('')
      }} /></label>
      <label>Location<input value={location} onChange={e => setLocation(e.target.value)} /></label>
      <label>Event date<input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} /></label>
      <label>Event timezone<input required value={timezone} onChange={e => setTimezone(e.target.value)} /></label>
      <p className="muted">Enter times in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
      <label>Start time<input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>End time<input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <div className="public-event-editor-actions"><button type="submit" className="btn-primary">{busy ? 'Saving…' : 'Save event'}</button><button type="button" onClick={onCancel}>Cancel</button></div>
    </fieldset>
    {error ? <p role="alert">{error}</p> : null}
  </form>
}
