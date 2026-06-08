import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { pidpAppLoginUrl } from '../../../config/pidp'
import { createQrSvg } from '../../utils/qr'
import { setSeoMeta } from '../../utils/seo'
import { createVCard, vCardFileName } from '../../utils/vcard'

const ORG_API_BASE = '/api/org'
const PORTAL_ASSET_BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

async function responseError(resp: Response, fallback: string) {
  const text = await resp.text().catch(() => '')
  if (!text) return fallback
  try {
    const parsed = JSON.parse(text) as { detail?: unknown }
    if (typeof parsed.detail === 'string' && parsed.detail.trim()) return parsed.detail.trim()
  } catch {
    // Plain text response.
  }
  return text
}

function publicProfileUrl(slug?: string | null) {
  const cleanSlug = String(slug || '').trim()
  const publicBase = (import.meta.env.VITE_PUBLIC_BASE as string | undefined)?.trim() || '/p/'
  const normalizedBase = publicBase.startsWith('http')
    ? publicBase
    : `${window.location.origin}${publicBase.startsWith('/') ? publicBase : `/${publicBase}`}`
  const base = normalizedBase.replace(/\/+$/, '')
  return cleanSlug ? `${base}/users/${encodeURIComponent(cleanSlug)}` : null
}

function displayUrl(value: string): string {
  return value.replace(/^mailto:/i, '').replace(/^tel:/i, '').replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

function safeLinkUrl(value?: string | null): string | null {
  const text = String(value || '').trim()
  if (!text) return null
  try {
    const candidate = /^(https?:|mailto:|tel:)/i.test(text) ? text : `https://${text.replace(/^\/+/, '')}`
    const parsed = new URL(candidate)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:' || parsed.protocol === 'tel:') {
      return parsed.toString()
    }
  } catch {
    return null
  }
  return null
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
  upcoming_events_count?: number
}

type PublicEvent = {
  id: string
  title: string
  slug: string
  starts_at?: string | null
  location?: string | null
  image_url?: string | null
}

export function PublicContactPage() {
  const { token, user } = useAuth()
  const { slug } = useParams()
  const [page, setPage] = useState<ContactPage | null>(null)
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [status, setStatus] = useState<string>('Loading…')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined
    Promise.all([
      fetch(orgUrl(`/api/network/users/public/${encodeURIComponent(slug)}`), { headers }).then(async (resp) => {
        if (!resp.ok) {
          throw new Error(await responseError(resp, `Profile not found (${resp.status})`))
        }
        return resp.json() as Promise<ContactPage>
      }),
      fetch(orgUrl(`/api/network/users/public/${encodeURIComponent(slug)}/events?upcoming_only=true&limit=8`))
        .then(async (resp) => (resp.ok ? ((await resp.json()) as PublicEvent[]) : []))
        .catch(() => []),
    ])
      .then(([data, eventRows]) => {
        setPage(data)
        setEvents(eventRows)
        setStatus('')
        const canonicalUrl = publicProfileUrl(data.slug) || window.location.href
        setSeoMeta({
          title: `${data.user_name} • Org Portal`,
          description:
            data.headline?.trim() ||
            data.bio?.trim()?.slice(0, 180) ||
            `${data.user_name} public profile on Org Portal.`,
          canonicalUrl,
          imageUrl: data.photo_url || undefined,
          type: 'website',
          robots: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
        })
      })
      .catch((err) => {
        setPage(null)
        setEvents([])
        setStatus(err instanceof Error ? err.message : 'Public profile unavailable')
        setSeoMeta({
          title: 'Profile Unavailable • Org Portal',
          description: 'The requested public profile could not be found.',
          canonicalUrl: `${window.location.origin}/users/${encodeURIComponent(slug)}`,
          type: 'website',
          robots: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
        })
      })
  }, [slug, token])

  const qrSvg = useMemo(() => {
    const shareUrl = publicProfileUrl(page?.slug)
    if (!shareUrl) return null
    try {
      return createQrSvg(shareUrl, 7, 3)
    } catch {
      return null
    }
  }, [page?.slug])

  function downloadQrSvg() {
    if (!qrSvg || !page?.slug) return
    const blob = new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = `${page.slug}-profile-qr.svg`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(href)
  }

  function downloadVCard() {
    if (!page) return
    const publicUrl = publicProfileUrl(page.slug) || window.location.href
    const vCard = createVCard(page, publicUrl)
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

  const isOwner = Boolean(token && user?.id && page?.user_id === user.id)
  const contactLinks = page
    ? [
        page.email_public ? { label: 'Email', url: `mailto:${page.email_public}`, display: page.email_public } : null,
        page.phone_public ? { label: 'Phone', url: `tel:${page.phone_public}`, display: page.phone_public } : null,
        page.website_url ? { label: 'Website', url: safeLinkUrl(page.website_url), display: page.website_url } : null,
        page.linkedin_url ? { label: 'LinkedIn', url: safeLinkUrl(page.linkedin_url), display: page.linkedin_url } : null,
        page.github_url ? { label: 'GitHub', url: safeLinkUrl(page.github_url), display: page.github_url } : null,
        page.x_url ? { label: 'X', url: safeLinkUrl(page.x_url), display: page.x_url } : null,
        ...(page.links || []).map((link) => ({ label: link.label, url: safeLinkUrl(link.url), display: link.url })),
      ].filter((link): link is { label: string; url: string; display: string } => Boolean(link?.url))
    : []
  const shareUrl = publicProfileUrl(page?.slug)

  function copyLink(key: string, value: string) {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopiedKey(key)
        window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600)
      })
      .catch(() => {
        setCopiedKey(null)
      })
  }

  if (!page) {
    return (
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Public Profile</h1>
        <p className="muted">{status}</p>
      </section>
    )
  }

  return (
    <section className="public-id-page">
      <article className="public-id-card" aria-label={`${page.user_name} public ID`}>
        <div className="public-id-identity">
          {page.photo_url ? (
            <img className="public-id-avatar" src={page.photo_url} alt={page.user_name} />
          ) : (
            <div className="public-id-avatar public-id-avatar-fallback" aria-hidden="true">
              {page.user_name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="public-id-kicker">Public ID</div>
          <h1 className="public-id-name">{page.user_name}</h1>
          {page.headline ? <p className="public-id-headline">{page.headline}</p> : null}
          {page.bio ? <p className="public-id-bio">{page.bio}</p> : null}
        </div>
        <button type="button" className="public-id-download-card" onClick={downloadVCard}>
          <span className="public-id-download-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4.5 2A2.5 2.5 0 0 0 2 4.5v11A2.5 2.5 0 0 0 4.5 18h11a2.5 2.5 0 0 0 2.5-2.5v-11A2.5 2.5 0 0 0 15.5 2h-11Zm0 1.5h11A1.5 1.5 0 0 1 17 5v10a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15V5a1.5 1.5 0 0 1 1.5-1.5ZM10 5a.75.75 0 0 1 .75.75v4.2l1.23-1.23a.75.75 0 1 1 1.06 1.06l-2.5 2.5a.75.75 0 0 1-1.08 0l-2.5-2.5a.75.75 0 1 1 1.06-1.06l1.23 1.23V5.75A.75.75 0 0 1 10 5Zm-3 9.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z" />
            </svg>
          </span>
          <span>
            <strong>Download Contact</strong>
            <small>Save this profile as a vCard</small>
          </span>
        </button>

        <div className="public-id-actions">
          {token ? (
            <Link
              className="btn-primary public-profile-inbox-btn"
              to={`/chat?start=dm&user=${encodeURIComponent(page.slug)}`}
              aria-label={`Message ${page.user_name}`}
              title={`Message ${page.user_name}`}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h9A2.5 2.5 0 0 1 17 4.5v11A2.5 2.5 0 0 1 14.5 18h-9A2.5 2.5 0 0 1 3 15.5v-11Zm2.5-1A1.5 1.5 0 0 0 4 5v7h3.2a1 1 0 0 1 .82.43L9.1 14h1.8l1.08-1.57a1 1 0 0 1 .82-.43H16V5a1.5 1.5 0 0 0-1.5-1.5h-9ZM4 13v2.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V13h-2.67l-1.08 1.57a1 1 0 0 1-.82.43H8.57a1 1 0 0 1-.82-.43L6.67 13H4Z" />
              </svg>
              <span>Message</span>
            </Link>
          ) : (
            <a
              className="btn-primary public-profile-inbox-btn"
              href={pidpAppLoginUrl(`/chat?start=dm&user=${encodeURIComponent(page.slug)}`)}
              aria-label={`Sign in to message ${page.user_name}`}
              title={`Message ${page.user_name}`}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h9A2.5 2.5 0 0 1 17 4.5v11A2.5 2.5 0 0 1 14.5 18h-9A2.5 2.5 0 0 1 3 15.5v-11Zm2.5-1A1.5 1.5 0 0 0 4 5v7h3.2a1 1 0 0 1 .82.43L9.1 14h1.8l1.08-1.57a1 1 0 0 1 .82-.43H16V5a1.5 1.5 0 0 0-1.5-1.5h-9ZM4 13v2.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V13h-2.67l-1.08 1.57a1 1 0 0 1-.82.43H8.57a1 1 0 0 1-.82-.43L6.67 13H4Z" />
              </svg>
              <span>Message</span>
            </a>
          )}
          {isOwner ? (
            <div className="public-id-owner-controls" aria-label="Profile owner controls">
              <Link to="/contact-settings">Edit Profile</Link>
            </div>
          ) : null}
        </div>
        {isOwner && !page.enabled ? (
          <p className="muted public-id-owner-note">
            This profile is not visible to the public. Go to Edit Profile to enable it.
          </p>
        ) : null}

        {contactLinks.length > 0 ? (
          <div className="public-id-link-list" aria-label="Contact links">
            {contactLinks.map((link) => {
              const key = `${link.label}-${link.url}`
              return (
                <div className="public-id-link-row" key={key}>
                  <a className="public-id-link-name" href={link.url} target={link.url.startsWith('http') ? '_blank' : undefined} rel={link.url.startsWith('http') ? 'noreferrer' : undefined}>
                    {link.label}
                  </a>
                  <div className="public-id-link-url" title={link.display}>{displayUrl(link.display)}</div>
                  <button
                    type="button"
                    className="public-id-copy-btn"
                    onClick={() => copyLink(key, link.url)}
                    aria-label={`Copy ${link.label} link`}
                    title={`Copy ${link.label} link`}
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="M6 2.5A2.5 2.5 0 0 1 8.5 0h6A2.5 2.5 0 0 1 17 2.5v8A2.5 2.5 0 0 1 14.5 13h-6A2.5 2.5 0 0 1 6 10.5v-8Zm2.5-1A1.5 1.5 0 0 0 7 3v7a1.5 1.5 0 0 0 1.5 1.5h6A1.5 1.5 0 0 0 16 10V3a1.5 1.5 0 0 0-1.5-1.5h-6ZM3 6a1 1 0 0 1 1 1v8.5A1.5 1.5 0 0 0 5.5 17H12a1 1 0 1 1 0 2H5.5A3.5 3.5 0 0 1 2 15.5V7a1 1 0 0 1 1-1Z" />
                    </svg>
                    <span className="sr-only">{copiedKey === key ? 'Copied' : 'Copy'}</span>
                  </button>
                  {copiedKey === key ? <span className="public-id-copied">Copied</span> : null}
                </div>
              )
            })}
          </div>
        ) : null}

        <aside className="public-id-share">
          <div className="muted">Share Profile</div>
          {shareUrl ? (
            <div className="public-id-share-row">
              <a className="public-id-public-url" href={shareUrl}>Public page</a>
              <div className="public-id-link-url" title={shareUrl}>{displayUrl(shareUrl)}</div>
              <button
                type="button"
                className="public-id-copy-btn"
                onClick={() => copyLink('public-url', shareUrl)}
                aria-label="Copy public profile link"
                title="Copy public profile link"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M6 2.5A2.5 2.5 0 0 1 8.5 0h6A2.5 2.5 0 0 1 17 2.5v8A2.5 2.5 0 0 1 14.5 13h-6A2.5 2.5 0 0 1 6 10.5v-8Zm2.5-1A1.5 1.5 0 0 0 7 3v7a1.5 1.5 0 0 0 1.5 1.5h6A1.5 1.5 0 0 0 16 10V3a1.5 1.5 0 0 0-1.5-1.5h-6ZM3 6a1 1 0 0 1 1 1v8.5A1.5 1.5 0 0 0 5.5 17H12a1 1 0 1 1 0 2H5.5A3.5 3.5 0 0 1 2 15.5V7a1 1 0 0 1 1-1Z" />
                </svg>
                <span className="sr-only">{copiedKey === 'public-url' ? 'Copied' : 'Copy'}</span>
              </button>
              {copiedKey === 'public-url' ? <span className="public-id-copied">Copied</span> : null}
            </div>
          ) : null}
          {qrSvg ? <div aria-label="QR code for public profile" className="public-id-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : null}
          {qrSvg ? (
            <button type="button" onClick={downloadQrSvg}>
              Download QR (SVG)
            </button>
          ) : null}
          <p className="muted">
            Search engines are instructed not to index this page.
          </p>
        </aside>
      </article>

      {events.length > 0 ? (
        <section className="public-id-events">
          <h2 style={{ margin: 0 }}>Upcoming Events</h2>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {events.map((event) => (
              <a key={event.id} className="portal-card" href={`/events/${encodeURIComponent(event.slug)}`} style={{ padding: '0.8rem', textDecoration: 'none' }}>
                {event.image_url ? (
                  <img
                    src={event.image_url}
                    alt={event.title}
                    style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', marginBottom: '0.45rem' }}
                  />
                ) : null}
                <div><strong>{event.title}</strong></div>
                <div className="muted">
                  {event.starts_at ? new Date(event.starts_at).toLocaleString() : 'Date TBD'}
                  {event.location ? ` • ${event.location}` : ''}
                </div>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <a className="public-id-attribution" href="/" aria-label="Brought to you by Code Collective">
        <span>Brought to you by</span>
        <img src={`${PORTAL_ASSET_BASE}images/namebanner.png`} alt="Code Collective" />
      </a>
    </section>
  )
}
