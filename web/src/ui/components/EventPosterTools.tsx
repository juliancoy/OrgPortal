import { useEffect, useId, useState } from 'react'
import { Download, FileImage, Moon, Printer, RefreshCw, Sun, X } from 'lucide-react'
import './eventPoster.css'

type Format = 'letter' | 'letter-4up' | 'postcard' | 'social'
type Theme = 'light' | 'dark'
type Background = 'solid' | 'city' | 'gradient'
const formats: Record<Format, { label: string; width: number; height: number; print: string }> = {
  letter: { label: '8.5 x 11', width: 2550, height: 3300, print: '8.5in 11in' },
  'letter-4up': { label: 'Letter 2 × 2', width: 2550, height: 3300, print: '8.5in 11in' },
  postcard: { label: '4 x 6', width: 1200, height: 1800, print: '4in 6in' },
  social: { label: 'Social', width: 1200, height: 630, print: '12in 6.3in' },
}
const backgrounds: Record<Background, string> = {
  solid: 'Solid color',
  city: 'Baltimore city photo',
  gradient: 'High-contrast gradient',
}

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
  const [format, setFormat] = useState<Format>('letter')
  const [theme, setTheme] = useState<Theme>('light')
  const [background, setBackground] = useState<Background>('solid')
  const [retry, setRetry] = useState(0)
  const [poster, setPoster] = useState<{ url: string; blob: Blob; key: string } | null>(null)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const key = JSON.stringify([slug, format, theme, background, revision, retry])
  const ready = poster?.key === key ? poster : null
  useEffect(() => {
    const abort = new AbortController()
    let url: string | undefined
    const timeout = window.setTimeout(() => { setError('Poster request timed out. Try again.'); abort.abort() }, 30000)
    setPoster(null); setError('')
    const query = new URLSearchParams({ format, theme, background, version: '2', revision })
    fetch(`/api/org/api/network/events/public/${encodeURIComponent(slug)}/flyer.svg?${query}`, { signal: abort.signal, cache: 'no-cache' })
      .then(async response => {
        if (!response.ok || !response.headers.get('content-type')?.includes('image/svg+xml')) throw new Error('Poster unavailable. Try again.')
        const blob = await response.blob()
        if (abort.signal.aborted) return
        url = URL.createObjectURL(blob)
        setPoster({ url, blob, key })
      })
      .catch(() => { if (!abort.signal.aborted) setError('Poster unavailable. Try again.') })
      .finally(() => window.clearTimeout(timeout))
    return () => { window.clearTimeout(timeout); abort.abort(); if (url) URL.revokeObjectURL(url) }
  }, [slug, format, theme, background, revision, retry, key])

  function download(blob: Blob, extension: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `${slug}-${format}${theme === 'dark' ? '-dark' : ''}${background !== 'solid' ? `-${background}` : ''}.${extension}`
    document.body.append(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
  async function downloadPng() {
    if (!ready || exporting) return
    setExporting(true); setError('')
    try {
      const image = new Image()
      image.src = ready.url
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = formats[format].width; canvas.height = formats[format].height
      const context = canvas.getContext('2d')
      if (!context) throw new Error()
      context.fillStyle = theme === 'dark' ? '#101820' : '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error()), 'image/png'))
      download(blob, 'png')
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
          {(Object.keys(backgrounds) as Background[]).map(value => <option key={value} value={value}>{backgrounds[value]}</option>)}
        </select>
      </label>
      <div className="event-poster-actions">
        <button type="button" disabled={!ready || exporting} onClick={downloadPng} title="Download PNG"><Download size={18} aria-hidden="true"/>{exporting ? 'Exporting...' : 'PNG'}</button>
        <button type="button" disabled={!ready || exporting} onClick={() => ready && download(ready.blob, 'svg')} title="Download SVG"><FileImage size={18} aria-hidden="true"/>SVG</button>
        <button type="button" disabled={!ready || exporting} onClick={print} title="Print poster"><Printer size={18} aria-hidden="true"/>Print</button>
      </div>
    </div>
    {error && <div role="alert" className="event-poster-error">{error}<button type="button" title="Retry poster" onClick={() => setRetry(value => value + 1)}><RefreshCw size={18} aria-hidden="true"/>Retry</button></div>}
    <div className={`event-poster-preview event-poster-preview-${format}`} aria-busy={!ready && !error}>
      {ready ? <img src={ready.url} alt={`${title}, ${formats[format].label}, ${theme}, ${backgrounds[background]} poster`} onError={() => { setPoster(null); setError('Poster preview failed. Try again.') }}/> : <span role="status">{error ? 'Preview unavailable' : 'Generating poster...'}</span>}
    </div>
  </section>
}
