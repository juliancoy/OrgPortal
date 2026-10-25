import { organizationLinkLabels, type OrganizationLink } from '../../../../shared/organizationLinks'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import Download from 'lucide-react/dist/esm/icons/download.mjs'
import FileImage from 'lucide-react/dist/esm/icons/file-image.mjs'
import Moon from 'lucide-react/dist/esm/icons/moon.mjs'
import Printer from 'lucide-react/dist/esm/icons/printer.mjs'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.mjs'
import Sun from 'lucide-react/dist/esm/icons/sun.mjs'
import X from 'lucide-react/dist/esm/icons/x.mjs'
import './eventPoster.css'
import { bindCanvas, drawSelection } from './posterCanvas'
import { applySettings, defaults, elementLabels, parsePosterSvg, parseSettings, posterElementText, shadowDefaults, type ElementId, type ElementLayout, type PosterSettings } from './posterEditorState'
import { useGroupSite } from '../../config/timebankCommunity'

type Format = 'letter' | 'letter-4up' | 'postcard' | 'social'
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

type Props = { kind?: 'event' | 'organization'; slug: string; title: string; revision?: string; inline?: boolean; sourceUrl?: string | null; eventLinks?: { url: string; label?: string }[]; organizationSlug?: string | null; organizationLinks?: OrganizationLink[] }
export function EventPosterTools({ inline = false, ...props }: Props) {
  const [open, setOpen] = useState(false)
  if (inline) return <PosterEditor key={props.slug} {...props} />
  return <div className="event-poster-entry">
    <button type="button" className="portal-button-secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {open ? <X size={18} aria-hidden="true"/> : <FileImage size={18} aria-hidden="true"/>}{open ? 'Close poster' : 'Create poster'}
    </button>
    {open && <PosterEditor key={props.slug} {...props}/>}
  </div>
}

function PosterEditor({ kind = 'event', slug, title, revision = '', sourceUrl, eventLinks = [], organizationSlug, organizationLinks = [] }: Props) {
  const id = useId()
  const tenant = useGroupSite()
  const isLifeTech = tenant?.home_org_slug === 'lifetech'
  const isOrganization = kind === 'organization'
  const endpoint = `/api/org/api/network/${isOrganization ? 'orgs' : 'events'}/public/${encodeURIComponent(slug)}`
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [eventCount, setEventCount] = useState(0)
  const storageKey = `orgportal:poster:v1:${isOrganization ? 'organization:' : ''}${slug}`
  const [settings, setSettings] = useState<PosterSettings>(() => {
    const initial = { ...defaults, background: isOrganization ? 'gallery' as const : defaults.background }
    try {
      const stored = localStorage.getItem(storageKey)
      if (!stored) return initial
      const parsed = parseSettings(stored)
      if (isOrganization && ['city','lifetech'].includes(parsed.background)) parsed.background = initial.background
      return parsed
    } catch { return initial }
  })
  const { format, theme, background, mediaId, elements, selectedElement, zoom, offsetX, offsetY, opacity, dimming, edgeBlur, link } = settings
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  function setter<K extends keyof PosterSettings>(key: K) {
    return (value: PosterSettings[K] | ((old: PosterSettings[K]) => PosterSettings[K])) => setSettings(old => ({ ...old, [key]: typeof value === 'function' ? value(old[key]) : value }))
  }
  const links = [...new Set([sourceUrl, ...eventLinks.map(item => item.url)])].filter((url): url is string => {
    try { const parsed = new URL(url || ''); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password } catch { return false }
  })
  const requestedLink = link === 'whatsapp' ? `org-link:${organizationLinks.find(item=>item.type==='whatsapp')?.id || ''}` : link
  const selectedLink = organizationLinks.some(item=>`org-link:${item.id}`===requestedLink) || (!isOrganization && requestedLink === 'event-chat') || (requestedLink === 'group-chat' && organizationSlug) || links.includes(requestedLink) ? requestedLink : 'portal'
  const setLink = setter('link')
  const setFormat = setter('format'), setTheme = setter('theme'), setBackground = setter('background'), setMediaId = setter('mediaId')
  const setElements = setter('elements'), setSelectedElement = setter('selectedElement')
  const setZoom = setter('zoom'), setOffsetX = setter('offsetX'), setOffsetY = setter('offsetY'), setOpacity = setter('opacity'), setDimming = setter('dimming')
  const [storageError, setStorageError] = useState(false)
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, ...settings })); setStorageError(false) }
    catch { setStorageError(true) }
  }, [storageKey, settings])
  function resetSettings() {
    try { localStorage.removeItem(storageKey) } catch { /* Editing still works without storage. */ }
    setSettings({ ...defaults, background: isOrganization && gallery.length ? 'gallery' : defaults.background })
  }
  const [gallery, setGallery] = useState<{ id: string; label: string; alt?: string; source: string; url: string }[]>([])
  const [galleryStatus, setGalleryStatus] = useState('Loading gallery...')
  const elementLayout = selectedElement ? elements[selectedElement] || {} : {}
  function updateElement(change: ElementLayout) { if (!selectedElement) return; setElements(value => ({ ...value, [selectedElement]: { ...value[selectedElement], ...change } })) }
  const imageBackground = ['gallery', 'city', 'lifetech'].includes(background)
  const [galleryRetry, setGalleryRetry] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    setGallery([]); setGalleryStatus('Loading gallery...')
    fetch(`${endpoint}/poster-images`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]), cache: 'no-cache' })
      .then(async response => {
        if (!response.ok) throw new Error()
        const images = await response.json()
        if (abort.signal.aborted) return
        setGallery(images); setGalleryStatus(images.length ? '' : 'No images yet. Add images to the gallery.')
        if (isOrganization && !images.length) setSettings(old => old.background === 'gallery' ? { ...old, background: 'gradient' } : old)
      })
      .catch(() => { if (!abort.signal.aborted) setGalleryStatus('Could not load gallery.') })
    return () => abort.abort()
  }, [endpoint, revision, galleryRetry, isOrganization])
  const selectedMediaId = gallery.some(item => item.id === mediaId) ? mediaId : gallery[0]?.id || ''
  const [retry, setRetry] = useState(0)
  const [poster, setPoster] = useState<{ svg: SVGSVGElement; key: string } | null>(null)
  const preview = useRef<HTMLDivElement>(null)
  const imageControls = useRef<HTMLFieldSetElement>(null)
  const elementControls = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  // Layout controls never change this key: they are applied locally each frame.
  const key = JSON.stringify([slug, format, theme, background, selectedMediaId, selectedLink, organizationLinks, revision, retry, kind, settings.includeEvents, page])
  const ready = poster?.key === key ? poster : null
  useEffect(() => {
    if (background === 'gallery' && !selectedMediaId) { setPoster(null); setError(''); return }
    const abort = new AbortController()
    setPoster(null); setError('')
    const query = new URLSearchParams({ format, theme, background, version: '10', elements: JSON.stringify({description:{hidden:false}}), link: selectedLink, revision, mediaId: background === 'gallery' ? selectedMediaId : '', includeEvents: String(settings.includeEvents), page: String(page) })
    fetch(`${endpoint}/flyer.svg?${query}`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]), cache: 'no-cache' })
      .then(async response => {
        if (!response.ok || !response.headers.get('content-type')?.includes('image/svg+xml')) throw new Error()
        const svg = parsePosterSvg(await response.text())
        if (!abort.signal.aborted && isOrganization) {
          setPageCount(Number(response.headers.get('x-poster-pages')) || 1)
          setEventCount(Number(response.headers.get('x-poster-events')) || 0)
          setPage(Number(response.headers.get('x-poster-page')) || 1)
        }
        if (!abort.signal.aborted) setPoster({ svg, key })
      })
      .catch(() => { if (!abort.signal.aborted) setError('Poster unavailable. Try again.') })
    return () => abort.abort()
  }, [slug, format, theme, background, selectedMediaId, selectedLink, revision, retry, key, endpoint, isOrganization, settings.includeEvents, page])
  useLayoutEffect(() => {
    if (!ready || !preview.current) return
    // Shadow DOM isolates SVG IDs and typography from the surrounding page.
    const root = preview.current.shadowRoot || preview.current.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = ':host { display:block; width:100%; height:100% } :host > svg { width:100%; height:100%; display:block; touch-action:none; user-select:none } [data-poster-dimming] { pointer-events:none }'
    style.textContent += ' [data-poster-element] { cursor:pointer; pointer-events:bounding-box } [data-poster-element]:hover, [data-poster-selected] { outline:2px dashed #33c6d4; outline-offset:4px }'
    root.replaceChildren(style, ready.svg)
    const showControls = () => {
      const selected = settingsRef.current.selectedElement
      const panel = selected === 'background' ? imageControls.current : elementControls.current
      if (selected) panel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    ready.svg.addEventListener('click', showControls)
    const unbind = bindCanvas(ready.svg, () => settingsRef.current, next => {
      settingsRef.current = next
      setSettings(next)
    })
    return () => { unbind(); ready.svg.removeEventListener('click', showControls) }
  }, [ready])
  useLayoutEffect(() => {
    if (!ready) return
    const frame = requestAnimationFrame(() => {
      applySettings(ready.svg, settings)
      drawSelection(ready.svg, settings)
      for (const node of ready.svg.querySelectorAll('[data-poster-element]')) {
        node.toggleAttribute('data-poster-selected', node.getAttribute('data-poster-element') === selectedElement)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [ready, settings, selectedElement])
  function posterBlob(backgroundOnly = false) {
    if (!ready) throw new Error('Poster not ready')
    // Apply synchronously too, so exporting in the same frame cannot use stale controls.
    applySettings(ready.svg, settings)
    const exported = ready.svg.cloneNode(true) as SVGSVGElement
    exported.querySelectorAll('[data-editor-ui], [data-poster-element][display="none"]').forEach(node => node.remove())
    exported.querySelectorAll('[data-poster-selected]').forEach(node => node.removeAttribute('data-poster-selected'))
    if (backgroundOnly) exported.querySelectorAll('[data-poster-element]').forEach(node => node.remove())
    return new Blob([new XMLSerializer().serializeToString(exported)], { type: 'image/svg+xml' })
  }

  function download(blob: Blob, extension: string, backgroundOnly = false) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `${slug}-${format}${isOrganization && settings.includeEvents ? `-page-${page}` : ''}${theme === 'dark' ? '-dark' : ''}${background !== 'solid' ? `-${background}` : ''}${backgroundOnly ? '-background' : ''}.${extension}`
    document.body.append(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
  async function downloadPng(backgroundOnly = false) {
    if (!ready || exporting) return
    setExporting(true); setError('')
    try {
      const image = new Image()
      const backgroundUrl = URL.createObjectURL(posterBlob(backgroundOnly))
      image.src = backgroundUrl
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
  async function printAllPages() {
    if (!ready || exporting) return
    const popup = window.open('', '_blank')
    if (!popup) { setError('Print window blocked. Allow pop-ups and try again.'); return }
    popup.opener = null
    popup.document.title = `${title} - all upcoming events`
    setExporting(true); setError('')
    const urls: string[] = []
    try {
      const style = popup.document.createElement('style')
      style.textContent = `@page { size: ${formats[format].print}; margin: 0; } body { margin:0 } img { display:block; width:100%; height:auto; break-after:page } img:last-child { break-after:auto }`
      popup.document.head.append(style)
      for (let number = 1; number <= pageCount; number++) {
        const query = new URLSearchParams({ format, theme, background, link: selectedLink, mediaId: selectedMediaId, includeEvents: 'true', elements: JSON.stringify({description:{hidden:false}}), page: String(number) })
        const response = await fetch(`${endpoint}/flyer.svg?${query}`, { signal: AbortSignal.timeout(30000), cache: 'no-store' })
        if (!response.ok) throw new Error()
        const svg = parsePosterSvg(await response.text())
        if (Number(response.headers.get('x-poster-pages')) !== pageCount) throw new Error('Event list changed')
        applySettings(svg, settings)
        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], {type:'image/svg+xml'}))
        urls.push(url)
        const image = popup.document.createElement('img')
        image.alt = `${title}, page ${number} of ${pageCount}`
        image.src = url; popup.document.body.append(image)
        await image.decode()
      }
      popup.focus(); popup.print()
    } catch { popup.close(); setError('Could not print all pages. Retry after refreshing the poster.') }
    finally { urls.forEach(url => URL.revokeObjectURL(url)); setExporting(false) }
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
    const url = URL.createObjectURL(posterBlob())
    image.addEventListener('load', () => URL.revokeObjectURL(url), { once: true })
    image.addEventListener('error', () => URL.revokeObjectURL(url), { once: true })
    popup.document.head.append(style); popup.document.body.append(image); image.src = url
  }
  return <section className="event-poster" aria-labelledby={id}>
    <h2 id={id}>{isOrganization ? 'Organization poster' : 'Event poster'}</h2>
    <p>{storageError ? "Settings could not be saved in this browser." : `Settings are saved automatically for this ${kind} in this browser.`}</p>
    {isOrganization && <div className="event-poster-toolbar">
      <label className="event-poster-include-events"><input type="checkbox" disabled={exporting} checked={settings.includeEvents} onChange={event => { setSettings(old=>({...old,includeEvents:event.target.checked,elements:{...old.elements,description:{...old.elements.description,hidden:!event.target.checked}}})); setPage(1) }} /> Include all upcoming hosted events</label>
      {settings.includeEvents && <div role="group" aria-label="Poster pages">
        <button type="button" disabled={page <= 1 || !ready || exporting} onClick={() => setPage(value => value - 1)}>Previous page</button>
        <span role="status"> Page {page} of {pageCount} · {eventCount} upcoming events </span>
        <button type="button" disabled={page >= pageCount || !ready || exporting} onClick={() => setPage(value => value + 1)}>Next page</button>
        <p>Every hosted event is included across these pages. Downloads use the current page. Print all pages includes the complete list.</p>
      </div>}
    </div>}
    <div className="event-poster-workspace">
      <div className="event-poster-canvas-column">
        <div className={`event-poster-preview event-poster-preview-${format}`} aria-busy={!ready && !error && (background !== 'gallery' || Boolean(selectedMediaId))}>
          {ready ? <div ref={preview} role="img" aria-label={`${title}, ${formats[format].label}, ${theme}, ${backgrounds[background]} poster`}/> : <span role="status">{error ? 'Preview unavailable' : background === 'gallery' && !selectedMediaId ? 'Select a gallery image to preview your poster.' : 'Generating poster...'}</span>}
        </div>
      </div>
      <div className="event-poster-settings">
    <button type="button" onClick={resetSettings} disabled={exporting}>Reset all settings</button>
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
        <select aria-label="Background" value={background} onChange={event => setBackground(event.target.value as Background)} disabled={exporting}>
          {(Object.keys(backgrounds) as Background[]).filter(value => isOrganization ? !['city','lifetech'].includes(value) : value !== 'lifetech' || isLifeTech).map(value => <option key={value} value={value}>{backgrounds[value]}</option>)}
        </select>
      </label>
      <label className="event-poster-background">
        <span>Poster link</span>
        <select aria-label="Poster link" value={selectedLink} onChange={event => setLink(event.target.value)} disabled={exporting}>
          <option value="portal">{isOrganization ? 'This organization page (OrgPortal)' : 'This event page (OrgPortal)'}</option>
          {organizationLinks.map(item=><option key={item.id} value={`org-link:${item.id}`}>Organization: {item.label || organizationLinkLabels[item.type]}</option>)}
          {!isOrganization && <option value="event-chat">Event conversation (OrgPortal)</option>}
          {organizationSlug && <option value="group-chat">Organization group chat (OrgPortal)</option>}
          {links.map(url => <option key={url} value={url}>{eventLinks.find(item => item.url === url)?.label || (isOrganization ? 'Organization website' : 'Associated event')} — {url}</option>)}
        </select>
        <small>Used by the QR code and printed website. Organization Links are managed in organization settings. Native chat uses your OrgPortal sign-in; organization rooms require membership.{!links.length && !isOrganization && ' No external event link is attached yet.'}</small>
      </label>
      <div className="event-poster-actions">
        <button type="button" disabled={!ready || exporting} onClick={() => void downloadPng()} title="Download PNG"><Download size={18} aria-hidden="true"/>{exporting ? 'Exporting...' : 'PNG'}</button>
        {isOrganization && settings.includeEvents && pageCount > 1 && <button type="button" disabled={!ready || exporting} onClick={() => void printAllPages()}><Printer size={18} aria-hidden="true"/>Print all pages</button>}
        {background === 'lifetech' && <button type="button" disabled={!ready || exporting} onClick={() => void downloadPng(true)} title={`Download plain background, ${formats[format].width} × ${formats[format].height} pixels`}><Download size={18} aria-hidden="true"/>Background PNG</button>}
        <button type="button" disabled={!ready || exporting} onClick={() => ready && download(posterBlob(), 'svg')} title="Download SVG"><FileImage size={18} aria-hidden="true"/>SVG</button>
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
    {selectedElement === 'background' && imageBackground && (background !== 'gallery' || selectedMediaId) && <fieldset ref={imageControls} className="event-poster-crop" disabled={exporting}>
      <legend>Adjust background image</legend>
      <button type="button" aria-pressed={selectedElement === 'background'} onClick={() => setSelectedElement('background')}>Select background on canvas</button>
      <label className="event-poster-visible"><input type="checkbox" checked={edgeBlur} onChange={event => setter('edgeBlur')(event.target.checked)}/>Blur image into empty edges</label>
      <div className="event-poster-actions" role="group" aria-label="Image framing">
        <button type="button" aria-pressed={settings.imageFit === 'contain'} onClick={() => setSettings(old => ({ ...old, imageFit: 'contain', zoom: 1, offsetX: 0, offsetY: 0, selectedElement: 'background' }))}>Fit image</button>
        <button type="button" aria-pressed={settings.imageFit === 'cover'} onClick={() => setSettings(old => ({ ...old, imageFit: 'cover', zoom: 1, offsetX: 0, offsetY: 0, selectedElement: 'background' }))}>Fill canvas</button>
        <button type="button" onClick={() => { setOffsetX(0); setOffsetY(0) }}>Center image</button>
      </div>
      <label>Opacity: {Math.round(opacity * 100)}%<input type="range" min="0" max="1" step="0.01" value={opacity} onChange={event => setOpacity(Number(event.target.value))}/></label>
      <label>Background dimming: {Math.round(dimming * 100)}% (0% = full brightness)<input type="range" min="0" max="1" step="0.01" value={dimming} onChange={event => setDimming(Number(event.target.value))}/></label>
      <label>Zoom: {Math.round(zoom * 100)}%<input type="range" min="0.25" max="3" step="0.05" value={zoom} onChange={event => setZoom(Number(event.target.value))}/></label>
      <label>Horizontal position: {Math.round(offsetX)}<input type="range" min="-100" max="100" step="1" value={offsetX} onChange={event => setOffsetX(Number(event.target.value))}/></label>
      <label>Vertical position: {Math.round(offsetY)}<input type="range" min="-100" max="100" step="1" value={offsetY} onChange={event => setOffsetY(Number(event.target.value))}/></label>
      <button type="button" onClick={() => { setZoom(1); setOffsetX(0); setOffsetY(0); setOpacity(1); setDimming(.66); setter('edgeBlur')(false); setter('imageFit')('original') }}>Reset image</button>
    </fieldset>}
    <div className="event-poster-elements" ref={elementControls}>
      <h3>Selected element</h3>
      <fieldset className="event-poster-crop" disabled={exporting}>
        <legend>Element settings</legend>
        <label>Element<select aria-label="Element" value={selectedElement || ''} onChange={event => setSelectedElement(event.target.value ? event.target.value as ElementId : null)}>
          <option value="">Select an element on the poster</option>
          {Object.entries(elementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {selectedElement && ready && posterElementText(ready.svg, selectedElement) !== null && <label className="event-poster-text">Text<textarea aria-label="Element text" maxLength={4000} rows={3} value={elementLayout.text ?? posterElementText(ready.svg, selectedElement) ?? ''} onChange={event => updateElement({ text: event.target.value })}/><span>Changes apply to this poster only.</span><button type="button" onClick={() => setElements(value => { const next = { ...value[selectedElement] }; delete next.text; return { ...value, [selectedElement]: next } })}>Restore original text</button></label>}
        {selectedElement && selectedElement !== 'background' && <label className="event-poster-visible"><input type="checkbox" checked={!elementLayout.hidden} onChange={event => updateElement({ hidden: !event.target.checked })}/>Show {elementLabels[selectedElement].toLowerCase()}</label>}
        {selectedElement && selectedElement !== 'background' && <><label className="event-poster-visible"><input type="checkbox" checked={elementLayout.shadow === true} onChange={event => updateElement({ shadow: event.target.checked })}/>Drop shadow</label>
        {elementLayout.shadow && <>
          <label>Shadow strength: {Math.round((elementLayout.shadowOpacity ?? shadowDefaults.shadowOpacity) * 100)}%<input type="range" min="0" max="1" step="0.05" value={elementLayout.shadowOpacity ?? shadowDefaults.shadowOpacity} onChange={event => updateElement({ shadowOpacity: Number(event.target.value) })}/></label>
          <label>Shadow blur: {elementLayout.shadowBlur ?? shadowDefaults.shadowBlur}<input type="range" min="0" max="30" step="0.5" value={elementLayout.shadowBlur ?? shadowDefaults.shadowBlur} onChange={event => updateElement({ shadowBlur: Number(event.target.value) })}/></label>
          <label>Shadow distance: {elementLayout.shadowDistance ?? shadowDefaults.shadowDistance}<input type="range" min="0" max="30" step="0.5" value={elementLayout.shadowDistance ?? shadowDefaults.shadowDistance} onChange={event => updateElement({ shadowDistance: Number(event.target.value) })}/></label>
          <label>Shadow thickness: {elementLayout.shadowSpread ?? shadowDefaults.shadowSpread}<input type="range" min="0" max="12" step="0.5" value={elementLayout.shadowSpread ?? shadowDefaults.shadowSpread} onChange={event => updateElement({ shadowSpread: Number(event.target.value) })}/></label>
          <button type="button" onClick={() => updateElement(shadowDefaults)}>Reset shadow</button>
        </>}
        <label>Size: {Math.round((elementLayout.scale ?? 1) * 100)}%<input type="range" min="0.25" max="3" step="0.05" value={elementLayout.scale ?? 1} onChange={event => updateElement({ scale: Number(event.target.value) })}/></label>
        <label>Horizontal position: {Math.round(elementLayout.x ?? 0)}<input type="range" min="-100" max="100" value={elementLayout.x ?? 0} onChange={event => updateElement({ x: Number(event.target.value) })}/></label>
        <label>Vertical position: {Math.round(elementLayout.y ?? 0)}<input type="range" min="-100" max="100" value={elementLayout.y ?? 0} onChange={event => updateElement({ y: Number(event.target.value) })}/></label>
        <button type="button" onClick={() => setElements(value => { const next = { ...value }; delete next[selectedElement]; return next })}>Reset element</button>
        <button type="button" onClick={() => setElements({})}>Reset all elements</button></>}
      </fieldset>
      {!selectedElement && <p>Click an element on the poster to adjust its size and position.</p>}
    </div>
    {error && <div role="alert" className="event-poster-error">{error}<button type="button" title="Retry poster" onClick={() => setRetry(value => value + 1)}><RefreshCw size={18} aria-hidden="true"/>Retry</button></div>}
      <p>Drag an image or text on the canvas to move it. Drag a corner handle to resize. Select the background in the element menu or drag an empty image area to move it. Sliders provide precise positioning.</p>

      </div>
    </div>
  </section>
}
