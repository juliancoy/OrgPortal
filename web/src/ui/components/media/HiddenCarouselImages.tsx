import { useEffect, useState } from 'react'
import { useAuth } from '../../../app/AppProviders'
import { getDomainTenant } from '../../../config/timebankCommunity'
import { getActivePortalProfileConfig } from '../../../config/portalFeatures'

type Image = { id: string; name: string; imageUrl: string; driveUrl: string }
const api = '/api/org/api/media/carousels/medtech-photos'
async function read(response: Response) {
  if (!response.ok) throw new Error('Unable to load or restore your hidden photos. Please try again.')
  return response.json()
}
export function HiddenCarouselImages() {
  const { token } = useAuth()
  const tenantId = getActivePortalProfileConfig().tenantId
  const enabled = ['medtech.social', 'lifetech.fyi'].includes(getDomainTenant()?.hostname || '')
  const [images, setImages] = useState<Image[]>([])
  const [status, setStatus] = useState('Loading your hidden photos…')
  const [busy, setBusy] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let cancelled = false
    setImages([])
    if (!token || !enabled) return
    setStatus('Loading your hidden photos…')
    Promise.all([
      fetch(api, { cache: 'no-store' }).then(read),
      fetch(`${api}/me`, { headers: { Authorization: `Bearer ${token}` }, credentials: 'include', cache: 'no-store' }).then(read),
    ]).then(([folder, state]: [{ images: Image[] }, { hiddenImageIds: string[] }]) => {
      if (cancelled) return
      setImages(folder.images.filter(image => state.hiddenImageIds.includes(image.id)))
      setStatus('')
    }).catch(error => { if (!cancelled) setStatus(error.message) })
    return () => { cancelled = true }
  }, [token, tenantId, enabled, refresh])
  if (!token || !enabled) return null
  return <section id="hidden-community-photos" className="panel" style={{ marginTop: 24 }}>
    <h2>Hidden community photos</h2>
    <p>Hidden from your carousel. Restore them whenever you like.</p>
    <a href="/#community-photos">Back to the community carousel</a>
    {status ? <p role="status">{status}</p> : !images.length ? <p>You have no hidden photos.</p> : null}
    {status && !status.startsWith('Loading') ? <button type="button" onClick={() => setRefresh(value => value + 1)}>Retry</button> : null}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 18, marginTop: 18 }}>
      {images.map(image => <article key={image.id}>
        <a href={image.driveUrl} target="_blank" rel="noopener noreferrer"><img src={image.imageUrl} alt={`Community photo: ${image.name}`} loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', height: 220, objectFit: 'contain' }} /></a>
        <p style={{ overflowWrap: 'anywhere' }}>{image.name}</p>
        <button type="button" disabled={busy !== null} onClick={async () => {
          setBusy(image.id); setStatus('')
          try {
            await read(await fetch(`${api}/me/hidden/${encodeURIComponent(image.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, credentials: 'include', cache: 'no-store' }))
            setImages(current => current.filter(item => item.id !== image.id))
          } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to restore this photo.') }
          finally { setBusy(null) }
        }}>{busy === image.id ? 'Restoring…' : 'Restore to carousel'}</button>
      </article>)}
    </div>
  </section>
}
