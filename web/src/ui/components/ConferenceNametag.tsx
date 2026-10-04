import { useId, useMemo, useRef, useState, type Ref } from 'react'
import { createQrSvg } from '../utils/qr'
import { portalPath } from '../../config/portalBase'
import { getDomainTenant } from '../../config/timebankCommunity'
import { type CSSProperties } from 'react'
import printStyles from './ConferenceNametag.css?inline'
import './ConferenceNametag.css'
import { printNametags } from '../utils/printNametags'

type Props = { name: string; avatarUrl: string; publicPageUrl: string | null }

export function NametagCard({ name, avatarUrl, publicPageUrl, badgeRef }: Props & { badgeRef?: Ref<HTMLDivElement> }) {
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
  const nameSize = longestLine > 22 ? '21pt' : longestLine > 15 ? '27pt' : '34pt'
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()

  return (
        <div className="conference-nametag" ref={badgeRef} style={brandStyle}>
          <img className="conference-nametag-background" src={portalPath('/assets/images/lifetech-hero.png')} alt="" aria-hidden="true" />
          <div className="conference-nametag-brand">
            <img src={logo.startsWith('/') ? portalPath(logo) : logo} alt="" />
            <div className="conference-nametag-lockup">
              <span>{branding?.name || 'LifeTech'}</span>
              <small>{branding?.tagline || 'Health × Medicine × Biotech'}</small>
            </div>
          </div>
          <strong className="conference-nametag-name" style={{ fontSize: nameSize }}>
            <span>{firstName}</span>
            {lastName && <span>{lastName}</span>}
          </strong>
          <div className="conference-nametag-footer">
            <div className="conference-nametag-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={`${name}'s avatar`} /> : <span aria-label="Avatar initials">{initials || '?'}</span>}
            </div>
            {qrSrc ? <img className="conference-nametag-qr" src={qrSrc} alt={`QR code linking to ${name}'s public page`} /> : <span className="conference-nametag-pending">Public page needed for QR code</span>}
          </div>
        </div>
  )
}

export function ConferenceNametag({ name, avatarUrl, publicPageUrl }: Props) {
  const badgeRef = useRef<HTMLDivElement>(null)
  const headingId = useId()
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState('')
  async function printBadge() {
    if (!badgeRef.current || !publicPageUrl) return
    setPrinting(true)
    setError('')
    try {
      await printNametags(badgeRef.current, `${printStyles}\n@page { size: auto; margin: 0.5in; } body { margin: 0; }`, `LifeTech nametag — ${name}`)
    } catch {
      setError('Could not open printing. Please try again.')
    } finally { setPrinting(false) }
  }
  return <section className="id-qr-card profile-settings-section conference-nametag-section" aria-labelledby={headingId}>
    <div className="profile-detail-header">
      <h2 id={headingId}>Conference nametag</h2>
      <button type="button" onClick={() => void printBadge()} disabled={!publicPageUrl || printing}>{printing ? 'Preparing…' : 'Print nametag'}</button>
    </div>
    <p className="muted">4 × 3 inches (102 × 76 mm). Print at 100% / actual size.</p>
    <div className="conference-nametag-preview"><NametagCard name={name} avatarUrl={avatarUrl} publicPageUrl={publicPageUrl} badgeRef={badgeRef} /></div>
    {!publicPageUrl && <p className="muted" role="status">Your nametag will be ready to print when your public page is available.</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
