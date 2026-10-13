import { useEffect, useId, useState } from 'react'
import { Download, FileImage, Moon, Printer, RefreshCw, Sun, X } from 'lucide-react'
import './eventPoster.css'
import { useGroupSite } from '../../config/timebankCommunity'

type Format = 'letter' | 'letter-4up' | 'postcard' | 'social'
type Theme = 'light' | 'dark'
type Background = 'solid' | 'city' | 'gradient' | 'lifetech' | 'gallery'
const formats: Record<Format, { label: string; width: number; height: number; print: string }> = {
  letter: { label: '8.5 x 11', width: 2550, height: 3300, print: '8.5in 11in' },
  'letter-4up': { label: 'Letter 2 × 2', width: 2550, height: 3300, print: '8.5in 11in' },
  postcard: { label: '4 x 6', width: 1200, height: 1800, print: '4in 6in' },
  social: { label: 'Social', width: 1200, height: 630, print: '12in 6.3in' },
}
const backgrounds: Record<Background, string> = {
  gallery: 'Event & organization images',
  solid: 'Solid color',
  city: 'Baltimore city photo',
  gradient: 'High-contrast gradient',
  lifetech: 'LifeTech plain artwork',
}

const elementLabels = { logo: 'Logo', brand: 'Organization name', tagline: 'Tagline', title: 'Title', date: 'Date', time: 'Time', location: 'Location', description: 'Description', qr: 'RSVP QR code', invitation: 'Join us', website: 'Website' }
type ElementId = keyof typeof elementLabels
type ElementLayout = { hidden?: boolean; scale?: number; x?: number; y?: number }

type Props = { slug: string; title: string; revision?: string; inline?: boolean }
export function EventPosterTools({ inline = false, ...props }: Props) {
  const [open, setOpen] = useState(false)
  if (inline) return <PosterEditor {...props} />
  return <div className="event-poster-entry">
    <button type="button" className="portal-button-secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {open ? <X size={18} aria-hidden="true"/> : <FileImage size={18} aria-hidden="true"/>}{open ? 'Close poster' : 'Create poster'}
    </button>
    {open && <PosterEditor {...props}/>}
  </div>
}

function PosterEditor({ slug, title, revision = '' }: Props) {
  const id = useId()
  const tenant = useGroupSite()
  const isLifeTech = tenant?.home_org_slug === 'lifetech'
  const [format, setFormat] = useState<Format>('letter')
  const [theme, setTheme] = useState<Theme>('light')
  const [background, setBackground] = useState<Background>('solid')
  const [gallery, setGallery] = useState<{ id: string; label: string; alt?: string; source: string; url: string }[]>([])
  const [galleryStatus, setGalleryStatus] = useState('Loading gallery...')
  const [mediaId, setMediaId] = useState('')
  const [elements, setElements] = useState<Partial<Record<ElementId, ElementLayout>>>({})
  const [selectedElement, setSelectedElement] = useState<ElementId>('time')
  const elementLayout = elements[selectedElement] || {}
  const elementsQuery = JSON.stringify(elements)
  function updateElement(change: ElementLayout) { setElements(value => ({ ...value, [selectedElement]: { ...value[selectedElement], ...change } })) }
  useEffect(() => { setElements({}) }, [slug])
  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const imageBackground = ['gallery', 'city', 'lifetech'].includes(background)
  const crop = { zoom: String(zoom), offsetX: String(offsetX), offsetY: String(offsetY) }
  useEffect(() => { setZoom(1); setOffsetX(0); setOffsetY(0) }, [slug, background, mediaId])
  const [galleryRetry, setGalleryRetry] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    setGallery([]); setMediaId(''); setGalleryStatus('Loading gallery...')
    fetch(`/api/org/api/network/events/public/${encodeURIComponent(slug)}/poster-images`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]), cache: 'no-cache' })
      .then(async response => {
        if (!response.ok) throw new Error()
        const images = await response.json()
        if (abort.signal.aborted) return
        setGallery(images); setGalleryStatus(images.length ? '' : 'No images yet. Add images to this event or an attached organization.')
      })
      .catch(() => { if (!abort.signal.aborted) setGalleryStatus('Could not load gallery.') })
    return () => abort.abort()
  }, [slug, revision, galleryRetry])
  const selectedMediaId = gallery.some(item => item.id === mediaId) ? mediaId : ''
  const [retry, setRetry] = useState(0)
  const [poster, setPoster] = useState<{ url: string; blob: Blob; key: string } | null>(null)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const key = JSON.stringify([slug, format, theme, background, selectedMediaId, revision, retry, zoom, offsetX, offsetY, elementsQuery])
  const ready = poster?.key === key ? poster : null
  useEffect(() => {
    if (background === 'gallery' && !selectedMediaId) { setPoster(null); setError(''); return }
    const abort = new AbortController()
    let url: string | undefined
    const timeout = window.setTimeout(() => { setError('Poster request timed out. Try again.'); abort.abort() }, 30000)
    setPoster(null); setError('')
    const query = new URLSearchParams({ format, theme, background, version: '7', elements: elementsQuery, ...crop, revision, mediaId: background === 'gallery' ? selectedMediaId : '' })
    const debounce = window.setTimeout(() => { fetch(`/api/org/api/network/events/public/${encodeURIComponent(slug)}/flyer.svg?${query}`, { signal: abort.signal, cache: 'no-cache' })
      .then(async response => {
        if (!response.ok || !response.headers.get('content-type')?.includes('image/svg+xml')) throw new Error('Poster unavailable. Try again.')
        const blob = await response.blob()
        if (abort.signal.aborted) return
        url = URL.createObjectURL(blob)
        setPoster({ url, blob, key })
      })
      .catch(() => { if (!abort.signal.aborted) setError('Poster unavailable. Try again.') })
      .finally(() => window.clearTimeout(timeout))
    }, 250)
    return () => { window.clearTimeout(debounce); window.clearTimeout(timeout); abort.abort(); if (url) URL.revokeObjectURL(url) }
  }, [slug, format, theme, background, selectedMediaId, revision, retry, key, zoom, offsetX, offsetY, elementsQuery])

  function download(blob: Blob, extension: string, backgroundOnly = false) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `${slug}-${format}${theme === 'dark' ? '-dark' : ''}${background !== 'solid' ? `-${background}` : ''}${backgroundOnly ? '-background' : ''}.${extension}`
    document.body.append(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
  async function downloadPng(backgroundOnly = false) {
    if (!ready || exporting) return
    setExporting(true); setError('')
    try {
      const image = new Image()
      let backgroundUrl: string | undefined
      if (backgroundOnly) {
        const query = new URLSearchParams({ format, theme, background, backgroundOnly: 'true', version: '6', ...crop })
        const response = await fetch(`/api/org/api/network/events/public/${encodeURIComponent(slug)}/flyer.svg?${query}`, { signal: AbortSignal.timeout(30000) })
        if (!response.ok || !response.headers.get('content-type')?.includes('image/svg+xml')) throw new Error()
        backgroundUrl = URL.createObjectURL(await response.blob())
      }
      image.src = backgroundUrl || ready.url
      try { await image.decode() } finally { if (backgroundUrl) URL.revokeObjectURL(backgroundUrl) }
      const canvas = document.createElement('canvas')
      canvas.width = formats[format].width; canvas.height = formats[format].height
      const context = canvas.getContext('2d')
      if (!context) throw new Error()
      context.fillStyle = theme === 'dark' ? '#101820' : '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error()), 'image/png'))
      download(blob, 'png', backgroundOnly)
    } catch { setError('PNG export failed. Retry or download SVG.') }
    finally { setExporting(false) }
  }
  function print() {
    if (!ready) return
    const popup = window.open('', '_blank')
    if (!popup) { setError('Print window blocked. Allow pop-ups and try again.'); return }
    popup.opener = null
    popup.document.title = `${title} - ${formats[format].label}`
    const style = popup.document.createElement('style')
    style.textContent = `@page { size: ${formats[format].print}; margin: 0; } html, body { margin: 0; } img { display: block; width: 100%; height: auto; }`
    const image = popup.document.createElement('img')
    image.alt = title
    image.onload = () => { popup.focus(); popup.print() }
    image.onerror = () => { popup.close(); setError('Print preview failed. Try again.') }
    popup.document.head.append(style); popup.document.body.append(image); image.src = ready.url
  }
  return <section className="event-poster" aria-labelledby={id}>
    <h2 id={id}>Event poster</h2>
    <div className="event-poster-toolbar">
      <div className="event-poster-formats" role="group" aria-label="Poster format">
        {(Object.keys(formats) as Format[]).map(value => <button type="button" key={value} aria-pressed={format === value} onClick={() => setFormat(value)} disabled={exporting}>{formats[value].label}</button>)}
      </div>
      <div className="event-poster-themes" role="group" aria-label="Poster color theme">
        <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')} disabled={exporting} title="Light poster"><Sun size={18} aria-hidden="true"/>Light</button>
        <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')} disabled={exporting} title="Dark poster"><Moon size={18} aria-hidden="true"/>Dark</button>
      </div>
      <label className="event-poster-background">
        <span>Background</span>
        <select value={background} onChange={event => setBackground(event.target.value as Background)} disabled={exporting}>
          {(Object.keys(backgrounds) as Background[]).filter(value => value !== 'lifetech' || isLifeTech).map(value => <option key={value} value={value}>{backgrounds[value]}</option>)}
        </select>
      </label>
      <div className="event-poster-actions">
        <button type="button" disabled={!ready || exporting} onClick={() => void downloadPng()} title="Download PNG"><Download size={18} aria-hidden="true"/>{exporting ? 'Exporting...' : 'PNG'}</button>
        {background === 'lifetech' && <button type="button" disabled={!ready || exporting} onClick={() => void downloadPng(true)} title={`Download plain background, ${formats[format].width} × ${formats[format].height} pixels`}><Download size={18} aria-hidden="true"/>Background PNG</button>}
        <button type="button" disabled={!ready || exporting} onClick={() => ready && download(ready.blob, 'svg')} title="Download SVG"><FileImage size={18} aria-hidden="true"/>SVG</button>
        <button type="button" disabled={!ready || exporting} onClick={print} title="Print poster"><Printer size={18} aria-hidden="true"/>Print</button>
      </div>
    </div>
    {background === 'gallery' && <div className="event-poster-gallery" role="group" aria-label="Gallery background image">
      {galleryStatus && <p role="status">{galleryStatus}</p>}
      {galleryStatus === 'Could not load gallery.' && <button type="button" onClick={() => setGalleryRetry(value => value + 1)}>Retry gallery</button>}
      {gallery.map((item, index) => <button type="button" key={item.id} aria-pressed={selectedMediaId === item.id} disabled={exporting} onClick={() => setMediaId(item.id)}>
        <img src={item.url.startsWith('/api/') ? `/api/org${item.url}` : item.url} alt={item.alt || ''} loading="lazy"/>
        <span>{item.label || `Image ${index + 1}`}<small style={{ display: 'block' }}>{item.source}</small></span>
      </button>)}
    </div>}
    {imageBackground && (background !== 'gallery' || selectedMediaId) && <fieldset className="event-poster-crop" disabled={exporting}>
      <legend>Adjust background image</legend>
      <label>Zoom: {Math.round(zoom * 100)}%<input type="range" min="1" max="3" step="0.05" value={zoom} onChange={event => setZoom(Number(event.target.value))}/></label>
      <label>Horizontal position: {offsetX}<input type="range" min="-100" max="100" step="1" value={offsetX} onChange={event => setOffsetX(Number(event.target.value))}/></label>
      <label>Vertical position: {offsetY}<input type="range" min="-100" max="100" step="1" value={offsetY} onChange={event => setOffsetY(Number(event.target.value))}/></label>
      <button type="button" onClick={() => { setZoom(1); setOffsetX(0); setOffsetY(0) }}>Reset image</button>
    </fieldset>}
    <details className="event-poster-elements">
      <summary>Adjust text and other elements</summary>
      <fieldset className="event-poster-crop" disabled={exporting}>
        <legend>Element settings</legend>
        <label>Element<select value={selectedElement} onChange={event => setSelectedElement(event.target.value as ElementId)}>
          {Object.entries(elementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="event-poster-visible"><input type="checkbox" checked={!elementLayout.hidden} onChange={event => updateElement({ hidden: !event.target.checked })}/>Show {elementLabels[selectedElement].toLowerCase()}</label>
        <label>Size: {Math.round((elementLayout.scale ?? 1) * 100)}%<input type="range" min="0.25" max="3" step="0.05" value={elementLayout.scale ?? 1} onChange={event => updateElement({ scale: Number(event.target.value) })}/></label>
        <label>Horizontal position: {elementLayout.x ?? 0}<input type="range" min="-100" max="100" value={elementLayout.x ?? 0} onChange={event => updateElement({ x: Number(event.target.value) })}/></label>
        <label>Vertical position: {elementLayout.y ?? 0}<input type="range" min="-100" max="100" value={elementLayout.y ?? 0} onChange={event => updateElement({ y: Number(event.target.value) })}/></label>
        <button type="button" onClick={() => setElements(value => { const next = { ...value }; delete next[selectedElement]; return next })}>Reset element</button>
        <button type="button" onClick={() => setElements({})}>Reset all elements</button>
      </fieldset>
      <p>Positions are relative to the original layout. Hidden elements leave their space available for manual positioning.</p>
    </details>
    {error && <div role="alert" className="event-poster-error">{error}<button type="button" title="Retry poster" onClick={() => setRetry(value => value + 1)}><RefreshCw size={18} aria-hidden="true"/>Retry</button></div>}
    <div className={`event-poster-preview event-poster-preview-${format}`} aria-busy={!ready && !error && (background !== 'gallery' || Boolean(selectedMediaId))}>
      {ready ? <img src={ready.url} alt={`${title}, ${formats[format].label}, ${theme}, ${backgrounds[background]} poster`} onError={() => { setPoster(null); setError('Poster preview failed. Try again.') }}/> : <span role="status">{error ? 'Preview unavailable' : background === 'gallery' && !selectedMediaId ? 'Select a gallery image to preview your poster.' : 'Generating poster...'}</span>}
    </div>
  </section>
}
