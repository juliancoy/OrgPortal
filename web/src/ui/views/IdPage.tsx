import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { createQrSvg } from '../utils/qr'
import { createVCard, vCardFileName } from '../utils/vcard'

const ORG_API_BASE = '/api/org'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type ContactLink = {
  label: string
  url: string
}

type ContactPage = {
  user_id: string
  user_name: string
  slug: string
  enabled: boolean
  headline?: string | null
  bio?: string | null
  photo_url?: string | null
  email_public?: string | null
  phone_public?: string | null
  linkedin_url?: string | null
  github_url?: string | null
  x_url?: string | null
  website_url?: string | null
  links?: ContactLink[]
  public_url?: string | null
}

function displayUrl(value: string): string {
  return value.replace(/^mailto:/i, '').replace(/^tel:/i, '').replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

function portalBaseUrl(): string {
  if (typeof window === 'undefined') return ''
  const publicBase = (import.meta.env.VITE_PUBLIC_BASE as string | undefined)?.trim() || '/p/'
  const normalizedBase = publicBase.startsWith('http')
    ? publicBase
    : `${window.location.origin}${publicBase.startsWith('/') ? publicBase : `/${publicBase}`}`
  return normalizedBase.replace(/\/+$/, '')
}

function publicProfileUrl(slug?: string | null, fallback?: string | null): string | null {
  const cleanSlug = String(slug || '').trim()
  const base = portalBaseUrl()
  if (cleanSlug && base) return `${base}/users/${encodeURIComponent(cleanSlug)}`
  return fallback?.trim() || null
}

function linkRows(page: ContactPage): ContactLink[] {
  const rows: ContactLink[] = []
  if (page.email_public) rows.push({ label: 'Email', url: `mailto:${page.email_public}` })
  if (page.phone_public) rows.push({ label: 'Phone', url: `tel:${page.phone_public}` })
  if (page.website_url) rows.push({ label: 'Website', url: page.website_url })
  if (page.linkedin_url) rows.push({ label: 'LinkedIn', url: page.linkedin_url })
  if (page.github_url) rows.push({ label: 'GitHub', url: page.github_url })
  if (page.x_url) rows.push({ label: 'X', url: page.x_url })
  rows.push(...(page.links || []))
  return rows
}

export function IdPage() {
  const { token } = useAuth()
  const [page, setPage] = useState<ContactPage | null>(null)
  const [status, setStatus] = useState('Loading...')

  useEffect(() => {
    document.title = 'Org Portal • ID'
  }, [])

  useEffect(() => {
    if (!token) {
      setStatus('Sign in required.')
      return
    }

    setStatus('Loading...')
    fetch(orgUrl('/api/network/contact/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Failed to load ID (${resp.status})`)
        }
        return resp.json() as Promise<ContactPage>
      })
      .then((data) => {
        setPage(data)
        setStatus('')
      })
      .catch((err) => {
        setPage(null)
        setStatus(err instanceof Error ? err.message : 'Failed to load ID')
      })
  }, [token])

  const rows = useMemo(() => (page ? linkRows(page) : []), [page])
  const qrPayload = useMemo(() => publicProfileUrl(page?.slug, page?.public_url), [page?.slug, page?.public_url])
  const qrSvg = useMemo(() => {
    if (!qrPayload) return null
    try {
      return createQrSvg(qrPayload, 7, 3)
    } catch {
      return null
    }
  }, [qrPayload])
  const vCard = useMemo(() => (page ? createVCard(page, qrPayload) : null), [page, qrPayload])

  function downloadVCard() {
    if (!page || !vCard) return
    const blob = new Blob([vCard], { type: 'text/vcard;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = vCardFileName(page.user_name || page.slug)
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(href)
  }

  if (!token) {
    return (
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>ID</h1>
        <p className="muted">{status}</p>
      </section>
    )
  }

  if (!page) {
    return (
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>ID</h1>
        <p className="muted">{status}</p>
      </section>
    )
  }

  return (
    <section className="id-page">
      <article className="id-card" aria-label="Code Collective ID">
        <div className="id-identity">
          {page.photo_url ? (
            <img
              className="id-avatar"
              src={page.photo_url}
              alt={page.user_name}
            />
          ) : (
            <span className="id-avatar id-avatar-fallback">
              {page.user_name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="id-kicker">ID</div>
          <h1 className="id-name">{page.user_name}</h1>
          {page.headline ? <p className="id-headline">{page.headline}</p> : null}
          {page.bio ? <p className="id-bio">{page.bio}</p> : null}
        </div>

        {rows.length > 0 ? (
          <div className="id-link-list" aria-label="Contact links">
            {rows.map((row) => (
              <a
                key={`${row.label}-${row.url}`}
                href={row.url}
                target={row.url.startsWith('http') ? '_blank' : undefined}
                rel={row.url.startsWith('http') ? 'noreferrer' : undefined}
                className="id-link-row"
              >
                <strong>{row.label}</strong>
                <span>{displayUrl(row.url)}</span>
              </a>
            ))}
          </div>
        ) : (
          <div className="id-empty">
            <p>No contact links have been recorded yet.</p>
          </div>
        )}

        <div className="id-qr-card">
          <div>
            <strong>QR</strong>
            {qrPayload ? <a className="id-qr-url" href={qrPayload}>{displayUrl(qrPayload)}</a> : null}
          </div>
          {qrSvg ? <div className="id-qr-frame" aria-label="QR code for this ID" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : null}
          {vCard ? (
            <button type="button" onClick={downloadVCard} className="secondary">
              Download vCard
            </button>
          ) : null}
          {!page.enabled ? (
            <p className="id-private-note">
              This ID is currently private. Enable the public page in settings to make the QR useful to others.
            </p>
          ) : null}
        </div>

        <div className="id-actions">
          <Link to="/contact-settings">Edit ID</Link>
          {page.enabled && qrPayload ? <a href={qrPayload}>Open Public Page</a> : null}
          {!page.enabled ? <Link to="/contact-settings">Enable Public Page</Link> : null}
        </div>
      </article>
    </section>
  )
}
