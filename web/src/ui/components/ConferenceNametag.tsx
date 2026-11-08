import { resolveAvatarUrl } from '../../config/avatarUrl'
import lifetechBrand from '../../../../shared/lifetechBrand.json'
import { useEffect, useId, useMemo, useRef, useState, type Ref } from 'react'
import { createQrSvg } from '../utils/qr'
import { portalPath } from '../../config/portalBase'
import { getGroupSite } from '../../config/timebankCommunity'
import { type CSSProperties } from 'react'
import printStyles from './ConferenceNametag.css?inline'
import './ConferenceNametag.css'
import { downloadNametag } from '../utils/downloadNametag'
import { printNametags } from '../utils/printNametags'

type Props = { name: string; avatarUrl: string; publicPageUrl: string | null; profilePageUrl?: string | null; websiteUrl?: string | null; linkedinUrl?: string | null; endeavours?: string }

export function NametagCard({ name, avatarUrl, publicPageUrl, profilePageUrl = publicPageUrl, endeavours = '', badgeRef, side = 'front' }: Props & { badgeRef?: Ref<HTMLDivElement>; side?: 'front' | 'back' }) {
  const qrSrc = useMemo(() => {
    const destination = side === 'front' ? profilePageUrl : publicPageUrl
    if (!destination) return null
    try {
      const url = new URL(destination, window.location.origin)
      if (side === 'front') {
        if (!/^\/users\/[^/]+\/?$/.test(url.pathname)) return null
        url.protocol = 'https:'
        url.host = 'lifetech.fyi'
        url.search = ''
        url.hash = ''
      }
      if (!['http:', 'https:'].includes(url.protocol)) return null
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createQrSvg(url.href))}`
    } catch {
      return null
    }
  }, [publicPageUrl, profilePageUrl, side])
  const tenant = getGroupSite()
  const branding = tenant?.home_org_slug === 'lifetech' ? tenant : null
  const brandStyle = {
    '--nametag-accent': branding?.accent_color || '#0f6f8f',
    '--nametag-ink': branding?.theme_color || '#061a26',
  } as CSSProperties
  const nameParts = name.trim().split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] || 'User'
  const lastName = nameParts.slice(1).join(' ')
  const longestLine = Math.max(firstName.length, lastName.length)
  const nameSize = longestLine > 22 ? '16pt' : longestLine > 15 ? '19pt' : longestLine > 10 ? '23pt' : '26pt'
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
          {side === 'front' && <img className="conference-nametag-background" src={portalPath('/assets/images/lifetech-hero.png')} alt="" aria-hidden="true" />}
          {side === 'front' && <div className="conference-nametag-brand">
            {qrSrc ? <img className="conference-nametag-front-qr" src={qrSrc} alt={`QR code linking to ${name}'s LifeTech public profile`} /> : <span className="conference-nametag-pending">Public profile needed for QR code</span>}
            <div className="conference-nametag-lockup">
              <span>{branding?.name || 'LifeTech'}</span>
              <small>{branding?.tagline && !/^Health\s*[×x]\s*Medicine\s*[×x]\s*Biotech$/i.test(branding.tagline) ? branding.tagline : lifetechBrand.tagline}</small>
            </div>
          </div>
          }
          {side === 'back' && <p className="conference-nametag-connect">Let’s connect</p>}
          <strong ref={nameRef} className="conference-nametag-name" style={{ fontSize: nameSize }}>
            <span>{firstName}</span>
            {lastName && <span>{lastName}</span>}
          </strong>
          {side === 'back' && endeavours.trim() && <p className="conference-nametag-endeavours">{endeavours}</p>}
          <div className="conference-nametag-footer">
            {side === 'front' && <div className="conference-nametag-avatar">
              {avatarUrl ? <img src={resolveAvatarUrl(avatarUrl)} alt={`${name}'s avatar`} /> : <span aria-label="Avatar initials">{initials || '?'}</span>}
            </div>}
            {side === 'back' && (qrSrc ? <img className="conference-nametag-qr" src={qrSrc} alt={`QR code linking to ${name}'s selected destination`} /> : <span className="conference-nametag-pending">Public page needed for QR code</span>)}
          </div>
          {side === 'back' && qrSrc && <div className="conference-nametag-profile-link"><span>Scan to connect</span><small>{publicPageUrl?.replace(/^https?:\/\//, '')}</small></div>}
        </div>
  )
}

export function ConferenceNametag({ name, avatarUrl, publicPageUrl, websiteUrl, linkedinUrl, endeavours = '' }: Props) {
  const [destination, setDestination] = useState('default')
  const [customWebsite, setCustomWebsite] = useState<string | null>(null)
  const [customLinkedin, setCustomLinkedin] = useState<string | null>(null)
  const [customEndeavours, setCustomEndeavours] = useState<string | null>(null)
  const website = customWebsite ?? websiteUrl ?? ''
  const linkedin = customLinkedin ?? linkedinUrl ?? ''
  const selectedUrl = destination === 'website' ? website : destination === 'linkedin' ? linkedin : destination === 'orgportal' ? publicPageUrl : website || linkedin || publicPageUrl
  let qrUrl: string | null = null
  try { const parsed = new URL(selectedUrl || ''); if (['https:', 'http:'].includes(parsed.protocol)) qrUrl = parsed.href } catch { /* Invalid destinations cannot be exported. */ }
  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const headingId = useId()
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  async function downloadBadge(side: 'front' | 'back', format: 'png' | 'jpg') {
    const badgeRef = side === 'front' ? frontRef : backRef
    if (!badgeRef.current || !qrUrl) return
    setDownloading(`${side}-${format}`); setError('')
    try { await downloadNametag(badgeRef.current, name, format, side) }
    catch { setError('Could not download the nametag. Check that its images have loaded and try again.') }
    finally { setDownloading(null) }
  }
  async function printBadge(side: 'front' | 'back' | 'both') {
    const badgeRef = side === 'front' ? frontRef : backRef
    if (!badgeRef.current || !qrUrl || (side === 'both' && !frontRef.current)) return
    setPrinting(true)
    setError('')
    try {
      if (side === 'both') {
        const sheet = document.createElement('div')
        sheet.className = 'conference-nametag-postcard'
        sheet.append(frontRef.current!.cloneNode(true), backRef.current!.cloneNode(true))
        await printNametags(sheet, `${printStyles}
@page { size: 4in 6in; margin: 0; }
html, body { margin: 0; padding: 0; width: 4in; }
.conference-nametag-postcard { display: grid; grid-template-rows: repeat(2, 53.98mm); width: 4in; height: 6in; gap: 6mm; align-content: center; justify-content: center; break-inside: avoid; }
.conference-nametag-postcard > .conference-nametag { margin: 0; }`, `LifeTech nametag 4 × 6 — ${name}`)
      } else {
        await printNametags(badgeRef.current, `${printStyles}\n@page { size: auto; margin: 0.5in; } body { margin: 0; }`, `LifeTech nametag ${side} — ${name}`)
      }
    } catch {
      setError('Could not open printing. Please try again.')
    } finally { setPrinting(false) }
  }
  return <section className="id-qr-card profile-settings-section conference-nametag-section" aria-labelledby={headingId}>
    <div className="profile-detail-header">
      <h2 id={headingId}>Conference nametag</h2>
    </div>
    <fieldset className="conference-nametag-options">
      <legend>Personal back</legend>
      <label>Other endeavours<textarea maxLength={180} rows={2} value={customEndeavours ?? endeavours} onChange={event => setCustomEndeavours(event.target.value)} /></label>
      <label>Personal website<input type="url" placeholder="https://example.com" value={website} onChange={event => setCustomWebsite(event.target.value)} /></label>
      <label>LinkedIn URL<input type="url" placeholder="https://www.linkedin.com/in/…" value={linkedin} onChange={event => setCustomLinkedin(event.target.value)} /></label>
      <label>QR destination<select value={destination} onChange={event => setDestination(event.target.value)}>
        <option value="default">Automatic · website, LinkedIn, then OrgPortal</option>
        <option value="website">Personal website</option><option value="linkedin">LinkedIn</option><option value="orgportal">OrgPortal profile</option>
      </select></label>
      <small>Changes apply to this preview and its downloads. Profile details are unchanged.</small>
    </fieldset>
    <p className="muted">Credit-card size: 85.6 × 53.98 mm (3.37 × 2.125 inches). Print at 100% / actual size. Each side downloads at 1011 × 638 pixels. Print each side separately, or stack both on one 4 × 6 inch sheet.</p>
    <div className="conference-nametag-downloads">
      <button type="button" onClick={() => void printBadge('both')} disabled={!qrUrl || printing || !!downloading}>Print credit-card pair on 4 × 6</button>
    </div>
    <p className="muted">For the combined sheet, choose 4 × 6 inch paper, no margins, 100% / actual size, background graphics on, and headers and footers off. Each side stays credit-card sized. Front is on top; back is below; trim around each card.</p>
    <div className="conference-nametag-sides">
      {(['front', 'back'] as const).map(value => <div key={value} className="conference-nametag-side">
        <h3>{value === 'front' ? 'Front · LifeTech' : 'Back · Endeavours and QR'}</h3>
        <div className="conference-nametag-preview"><NametagCard side={value} name={name} avatarUrl={avatarUrl} publicPageUrl={qrUrl} profilePageUrl={publicPageUrl} endeavours={(customEndeavours ?? endeavours).slice(0, 180)} badgeRef={value === 'front' ? frontRef : backRef} /></div>
        <div className="conference-nametag-downloads" role="group" aria-label={`${value} nametag actions`}>
          {(['png', 'jpg'] as const).map(format => <button key={format} type="button" disabled={!qrUrl || printing || !!downloading} onClick={() => void downloadBadge(value, format)}>{downloading === `${value}-${format}` ? 'Preparing…' : `Download ${value} ${format.toUpperCase()}`}</button>)}
          <button type="button" onClick={() => void printBadge(value)} disabled={!qrUrl || printing || !!downloading}>{`Print ${value}`}</button>
        </div>
      </div>)}
    </div>
    {!qrUrl && <p className="muted" role="status">Choose a valid website, LinkedIn or OrgPortal URL to print or download your nametag.</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
