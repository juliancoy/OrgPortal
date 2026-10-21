import { invalidatePublicOrganizationData } from '../../data/publicOrganization/cache'
import { useState } from 'react'

type Review = { previewId: string; organizationId: string; expiresAt: string; endpoint: string; payload: Record<string, unknown>; mode: 'directory' | 'owned' }
export function OrganizationRegistrationForm({ token, onSaved }: { token: string | null; onSaved: () => Promise<void> }) {
  const [mode, setMode] = useState<'directory' | 'owned'>('directory')
  const [kind, setKind] = useState<'organization' | 'team'>('organization')
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [source, setSource] = useState('')
  const [city, setCity] = useState('')
  const [image, setImage] = useState('')
  const [tags, setTags] = useState('')
  const [description, setDescription] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [review, setReview] = useState<Review | null>(null)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [status, setStatus] = useState('')
  async function request(path: string, payload?: Record<string, unknown>) {
    const response = await fetch(`/api/org${path}`, {
      method: payload ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    })
    const result = await response.json() as Record<string, unknown>
    if (!response.ok) throw new Error(String(result.error || result.detail || `Request failed (${response.status})`))
    return result
  }
  async function preview() {
    if (!token) return
    if (!name.trim() || !description.trim() || (mode === 'directory' && !source.trim()) || (mode === 'owned' && !acknowledged)) {
      setStatus('Provide the required fields and confirm your intent.'); return
    }
    setBusy(true); setStatus(''); setUncertain(false)
    try {
      const payload = mode === 'directory'
        ? { name: name.trim(), description: description.trim(), tags: tags.split(',').map(tag => tag.trim()).filter(Boolean), sourceUrl: source.trim(), ...(website.trim() ? { website: website.trim() } : {}), ...(city.trim() ? { city: city.trim() } : {}) }
        : { kind, name: name.trim(), description: description.trim(), tags: tags.split(',').map(tag => tag.trim()).filter(Boolean), ...(city.trim() ? { city: city.trim() } : {}), ...(image.trim() ? { image_url: image.trim() } : {}), acknowledgeOwnership: true, ...(website.trim() ? { source_url: website.trim() } : {}) }
      const endpoint = mode === 'directory' ? '/api/network/directory/registration' : '/api/network/owned-organizations'
      const result = await request(`${endpoint}/preview`, payload)
      if (typeof result.previewId !== 'string' || typeof result.expiresAt !== 'string' || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error('The server did not return a valid review. No changes were applied.')
      setReview({ previewId: String(result.previewId), expiresAt: String(result.expiresAt), organizationId: mode === 'directory' ? 'organization:registry' : String(result.organizationId), endpoint, payload, mode })
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not prepare the record') }
    finally { setBusy(false) }
  }
  async function apply() {
    if (!review) return
    setBusy(true); setStatus('')
    try {
      await request(`${review.endpoint}/apply`, { ...review.payload, previewId: review.previewId, confirm: true })
      await invalidatePublicOrganizationData()
      setReview(null); setName(''); setWebsite(''); setSource(''); setCity(''); setDescription(''); setImage(''); setTags(''); setAcknowledged(false)
      setStatus(review.mode === 'directory' ? 'Public directory listing added. No access or ownership was assigned.' : 'Organization created. Your account has owner access; legal representation has not been verified.')
      window.dispatchEvent(new Event('organization-access-change'))
      await onSaved()
    } catch (error) {
      setUncertain(true)
      setStatus(`${error instanceof Error ? error.message : 'The result is unavailable'}. Check the operation result before retrying.`)
    } finally { setBusy(false) }
  }
  async function inspect() {
    if (!review) return
    setBusy(true)
    try {
      const result = await request(`/api/network/orgs/${encodeURIComponent(review.organizationId)}/operations/${review.previewId}`)
      if (result.status === 'completed') { setStatus('The record was saved.'); setReview(null); setUncertain(false); await onSaved() }
      else if (result.status === 'prepared' && Number(result.expires_at) > Date.now()) { setStatus('The operation has not run. Review and apply again.'); setUncertain(false) }
      else { setStatus('The operation needs review. Inspect the live directory before creating a new preview.') }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not inspect the result') }
    finally { setBusy(false) }
  }
  return <section className="portal-card" style={{ display: 'grid', gap: '0.6rem' }} aria-labelledby="organization-registration-title">
    <h2 id="organization-registration-title" style={{ margin: 0, fontSize: '1rem' }}>Add an organization</h2>
    {!review ? <>
      <label>What do you need?<select value={mode} onChange={event => { setMode(event.target.value as 'directory' | 'owned'); setAcknowledged(false) }}>
        <option value="directory">Add a public directory listing</option><option value="owned">Create an organization I manage</option>
      </select></label>
      <p className="muted">{mode === 'directory' ? 'Directory listings describe organizations and grant no access. Publication currently requires a platform operator.' : 'This assigns owner access to your account. It does not verify legal ownership or representation.'}</p>
      {mode === 'owned' && <label>Type<select aria-label="Organization type" value={kind} onChange={event => setKind(event.target.value as 'organization' | 'team')}><option value="organization">Organization</option><option value="team">Team</option></select></label>}
      <label>Name<input value={name} onChange={event => setName(event.target.value)} maxLength={255} required /></label>
      <label>Website<input type="url" value={website} onChange={event => setWebsite(event.target.value)} /></label>
      {mode === 'directory' && <label>Public evidence URL<input type="url" value={source} onChange={event => setSource(event.target.value)} required /></label>}
      <label>City (optional)<input value={city} onChange={event => setCity(event.target.value)} maxLength={80} /></label>
      {mode === 'owned' && <label>Image URL (optional)<input type="url" value={image} onChange={event => setImage(event.target.value)} /></label>}
      <label>Tags, comma separated<input value={tags} onChange={event => setTags(event.target.value)} /></label>
      <label>Public description<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={5000} rows={3} required /></label>
      {mode === 'owned' && <label><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />I intend to manage this organization and understand my account will receive owner access.</label>}
      <button className="btn-secondary" type="button" disabled={!token || busy} onClick={preview}>Review changes</button>
    </> : <section aria-label="Review organization changes">
      <h3>{String(review.payload.name)}</h3><p>{String(review.payload.description)}</p>
      <dl>{([['kind', 'Type'], ['website', 'Website'], ['source_url', 'Website'], ['sourceUrl', 'Public evidence'], ['city', 'City'], ['tags', 'Tags'], ['image_url', 'Image URL']] as const).filter(([key]) => review.payload[key] && String(review.payload[key])).map(([key, label]) => <div key={key}><dt>{label}</dt><dd style={{ overflowWrap: 'anywhere' }}>{String(review.payload[key])}</dd></div>)}</dl>
      <p>{review.mode === 'directory' ? 'This will publish an unclaimed directory listing. No owner, member, administrator or portal will be created.' : 'This will create a public organization and give your signed-in account owner access. Legal representation remains unverified.'}</p>
      <p className="muted">Review expires {new Date(review.expiresAt).toLocaleTimeString()}.</p>
      <button type="button" className="btn-primary" disabled={busy || uncertain || Date.parse(review.expiresAt) <= Date.now()} onClick={apply}>{review.mode === 'directory' ? 'Publish directory listing' : 'Create with owner access'}</button>{' '}
      {!uncertain && <button type="button" className="btn-secondary" disabled={busy} onClick={() => setReview(null)}>Back</button>}
      {uncertain && <button type="button" className="btn-secondary" disabled={busy} onClick={inspect}>Check operation result</button>}
    </section>}
    {status && <p role="status">{status}</p>}
  </section>
}
