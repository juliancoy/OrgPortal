import { useEffect, useId, useMemo, useRef, useState, type Ref } from 'react'
import { createQrSvg } from '../utils/qr'
import { portalPath } from '../../config/portalBase'
import { getDomainTenant } from '../../config/timebankCommunity'
import { type CSSProperties } from 'react'
import printStyles from './ConferenceNametag.css?inline'
import './ConferenceNametag.css'
import { downloadNametag } from '../utils/downloadNametag'
import { printNametags } from '../utils/printNametags'

type Props = { name: string; avatarUrl: string; publicPageUrl: string | null }

export function NametagCard({ name, avatarUrl, publicPageUrl, badgeRef, side = 'front' }: Props & { badgeRef?: Ref<HTMLDivElement>; side?: 'front' | 'back' }) {
  const qrSrc = useMemo(() => {
    if (!publicPageUrl) return null
    try {
      const url = new URL(publicPageUrl, window.location.origin)
      if (!['http:', 'https:'].includes(url.protocol)) return null
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createQrSvg(url.href))}`
    } catch {
      return null
    }
  }, [publicPageUrl])
  const tenant = getDomainTenant()
  const branding = tenant?.home_org_slug === 'lifetech' ? tenant : null
  const brandStyle = {
    '--nametag-accent': branding?.accent_color || '#0f6f8f',
    '--nametag-ink': branding?.theme_color || '#061a26',
  } as CSSProperties
  const logo = branding?.brand_image_path || '/assets/images/lifetech-logo.png'
  const nameParts = name.trim().split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] || 'User'
  const lastName = nameParts.slice(1).join(' ')
  const longestLine = Math.max(firstName.length, lastName.length)
  const nameSize = longestLine > 22 ? '20pt' : longestLine > 15 ? '25pt' : longestLine > 10 ? '31pt' : '40pt'
  const nameRef = useRef<HTMLElement>(null)
  useEffect(() => {
    let cancelled = false
    const fitName = async () => {
      await document.fonts.load('700 40pt "Nametag Mattone"')
      if (cancelled || !nameRef.current) return
      const element = nameRef.current
      element.style.fontSize = nameSize
      const width = element.clientWidth
      const longestWidth = Math.max(...Array.from(element.children, line => line.scrollWidth))
      if (width > 0 && longestWidth > width) {
        element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * width / longestWidth}px`
      }
    }
    void fitName()
    return () => { cancelled = true }
  }, [name, nameSize])
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()

  return (
        <div className={`conference-nametag conference-nametag-${side}`} ref={badgeRef} aria-label={`${side === 'front' ? 'Front' : 'Back'} of ${name}’s nametag`} style={brandStyle}>
          <img className="conference-nametag-background" src={portalPath('/assets/images/lifetech-hero.png')} alt="" aria-hidden="true" />
          <div className="conference-nametag-brand">
            <div className="conference-nametag-logo"><img src={logo.startsWith('/') ? portalPath(logo) : logo} alt="" /></div>
            <div className="conference-nametag-lockup">
              <span>{branding?.name || 'LifeTech'}</span>
              <small>{branding?.tagline || 'Health × Medicine × Biotech'}</small>
            </div>
          </div>
          {side === 'back' && <p className="conference-nametag-connect">Let’s connect</p>}
          <strong ref={nameRef} className="conference-nametag-name" style={{ fontSize: nameSize }}>
            <span>{firstName}</span>
            {lastName && <span>{lastName}</span>}
          </strong>
          <div className="conference-nametag-footer">
            {side === 'front' && <div className="conference-nametag-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={`${name}'s avatar`} /> : <span aria-label="Avatar initials">{initials || '?'}</span>}
            </div>}
            {side === 'back' && (qrSrc ? <img className="conference-nametag-qr" src={qrSrc} alt={`QR code linking to ${name}'s public page`} /> : <span className="conference-nametag-pending">Public page needed for QR code</span>)}
          </div>
          {side === 'back' && qrSrc && <div className="conference-nametag-profile-link"><span>Scan for my profile</span><small>{publicPageUrl?.replace(/^https?:\/\//, '')}</small></div>}
        </div>
  )
}

export function ConferenceNametag({ name, avatarUrl, publicPageUrl }: Props) {
  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const [side, setSide] = useState<'front' | 'back'>('front')
  const badgeRef = side === 'front' ? frontRef : backRef
  const headingId = useId()
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<'png' | 'jpg' | null>(null)
  async function downloadBadge(format: 'png' | 'jpg') {
    if (!badgeRef.current || !publicPageUrl) return
    setDownloading(format); setError('')
    try { await downloadNametag(badgeRef.current, name, format, side) }
    catch { setError('Could not download the nametag. Check that its images have loaded and try again.') }
    finally { setDownloading(null) }
  }
  async function printBadge() {
    if (!badgeRef.current || !publicPageUrl) return
    setPrinting(true)
    setError('')
    try {
      await printNametags(badgeRef.current, `${printStyles}\n@page { size: auto; margin: 0.5in; } body { margin: 0; }`, `LifeTech nametag ${side} — ${name}`)
    } catch {
      setError('Could not open printing. Please try again.')
    } finally { setPrinting(false) }
  }
  return <section className="id-qr-card profile-settings-section conference-nametag-section" aria-labelledby={headingId}>
    <div className="profile-detail-header">
      <h2 id={headingId}>Conference nametag</h2>
      <button type="button" onClick={() => void printBadge()} disabled={!publicPageUrl || printing || !!downloading}>{printing ? 'Preparing…' : `Print ${side}`}</button>
    </div>
    <div className="conference-nametag-downloads" role="group" aria-label="Nametag side">{(['front', 'back'] as const).map(value => <button key={value} type="button" aria-pressed={side === value} disabled={printing || !!downloading} onClick={() => setSide(value)}>{value === 'front' ? 'Front · Name and photo' : 'Back · Profile and QR'}</button>)}</div>
    <div className="conference-nametag-downloads" role="group" aria-label="Download nametag">
      {(['png', 'jpg'] as const).map(format => <button key={format} type="button" disabled={!publicPageUrl || printing || !!downloading} onClick={() => void downloadBadge(format)}>{downloading === format ? 'Preparing…' : `Download ${side} ${format.toUpperCase()}`}</button>)}
    </div>
    <p className="muted">4 × 3 inches (102 × 76 mm). Print at 100% / actual size. Each side downloads at 1200 × 900 pixels. Print the front and back separately at actual size.</p>
    {(['front', 'back'] as const).map(value => <div key={value} className="conference-nametag-preview" hidden={side !== value}><NametagCard side={value} name={name} avatarUrl={avatarUrl} publicPageUrl={publicPageUrl} badgeRef={value === 'front' ? frontRef : backRef} /></div>)}
    {!publicPageUrl && <p className="muted" role="status">Your nametag will be ready to print or download when your public page is available.</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
