import { useMemo, useRef, useState } from 'react'
import { createQrSvg } from '../utils/qr'
import printStyles from './ConferenceNametag.css?inline'
import './ConferenceNametag.css'

type Props = { name: string; avatarUrl: string; publicPageUrl: string | null }

export function ConferenceNametag({ name, avatarUrl, publicPageUrl }: Props) {
  const badgeRef = useRef<HTMLDivElement>(null)
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState('')
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
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()

  async function printBadge() {
    if (!badgeRef.current || !qrSrc) return
    setPrinting(true)
    setError('')
    const frame = document.createElement('iframe')
    frame.title = 'Printable LifeTech nametag'
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-10000px;'
    document.body.append(frame)
    try {
      const doc = frame.contentDocument!
      const style = doc.createElement('style')
      style.textContent = `${printStyles}\n@page { size: auto; margin: 0.5in; } body { margin: 0; }`
      doc.head.append(style)
      doc.title = `LifeTech nametag — ${name}`
      doc.body.append(badgeRef.current.cloneNode(true))
      await Promise.all(Array.from(doc.images).map(img => img.decode().catch(() => undefined)))
      const printWindow = frame.contentWindow!
      printWindow.addEventListener('afterprint', () => frame.remove(), { once: true })
      printWindow.focus()
      printWindow.print()
    } catch {
      frame.remove()
      setError('Could not open printing. Please try again.')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <section className="id-qr-card profile-settings-section conference-nametag-section" aria-labelledby="nametag-heading">
      <div className="profile-detail-header">
        <h2 id="nametag-heading">Conference nametag</h2>
        <button type="button" onClick={() => void printBadge()} disabled={!qrSrc || printing}>
          {printing ? 'Preparing…' : 'Print nametag'}
        </button>
      </div>
      <p className="muted">4 × 3 inches (102 × 76 mm). Print at 100% / actual size.</p>
      <div className="conference-nametag-preview">
        <div className="conference-nametag" ref={badgeRef}>
          <div className="conference-nametag-brand">
            <img src="/assets/images/lifetech-logo.png" alt="" />
            <span>LifeTech</span>
          </div>
          <div className="conference-nametag-person">
            <div className="conference-nametag-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={`${name}'s avatar`} /> : <span aria-label="Avatar initials">{initials || '?'}</span>}
            </div>
            <strong className="conference-nametag-name">{name}</strong>
          </div>
          <div className="conference-nametag-footer">
            <span>Connect with me</span>
            {qrSrc ? <img className="conference-nametag-qr" src={qrSrc} alt={`QR code linking to ${name}'s public page`} /> : <span className="conference-nametag-pending">Public page needed for QR code</span>}
          </div>
        </div>
      </div>
      {!qrSrc && <p className="muted" role="status">Your nametag will be ready to print when your public page is available.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
