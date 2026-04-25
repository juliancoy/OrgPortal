import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createQrSvg } from '../../utils/qr'
import { setSeoMeta } from '../../utils/seo'

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
  headline?: string | null
  bio?: string | null
  photo_url?: string | null
  email_public?: string | null
  phone_public?: string | null
  linkedin_url?: string | null
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
  const { slug } = useParams()
  const [page, setPage] = useState<ContactPage | null>(null)
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [status, setStatus] = useState<string>('Loading…')

  useEffect(() => {
    if (!slug) return
    Promise.all([
      fetch(orgUrl(`/api/network/users/public/${encodeURIComponent(slug)}`)).then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Profile not found (${resp.status})`)
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
        const canonicalUrl = `${window.location.origin}/users/${encodeURIComponent(data.slug)}`
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
        setStatus(err instanceof Error ? err.message : 'Contact page unavailable')
        setSeoMeta({
          title: 'Profile Unavailable • Org Portal',
          description: 'The requested public profile could not be found.',
          canonicalUrl: `${window.location.origin}/users/${encodeURIComponent(slug)}`,
          type: 'website',
          robots: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
        })
      })
  }, [slug])

  const qrSvg = useMemo(() => {
    if (!page?.public_url) return null
    try {
      return createQrSvg(page.public_url, 7, 3)
    } catch {
      return null
    }
  }, [page?.public_url])

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

  if (!page) {
    return (
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Public Profile</h1>
        <p className="muted">{status}</p>
      </section>
    )
  }

  return (
    <section className="panel" style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <div className="muted" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.8rem' }}>
          Public Individual Profile
        </div>
        <h1 style={{ marginTop: 0, marginBottom: 0 }}>{page.user_name}</h1>
        {page.headline ? <p style={{ marginTop: 0 }}><strong>{page.headline}</strong></p> : null}
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)' }}>
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          {page.photo_url ? (
            <img
              src={page.photo_url}
              alt={page.user_name}
              style={{ width: '100%', maxWidth: 420, borderRadius: 12, border: '2px solid var(--border)' }}
            />
          ) : null}
          {page.bio ? <p>{page.bio}</p> : null}
        </div>
        <aside className="portal-card" style={{ padding: '0.9rem', display: 'grid', gap: '0.6rem', alignContent: 'start' }}>
          <div className="muted">Share Profile</div>
          {page.public_url ? <a href={page.public_url}>{page.public_url}</a> : null}
          {qrSvg ? (
            <div
              aria-label="QR code for public profile"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : null}
          {qrSvg ? (
            <button type="button" onClick={downloadQrSvg}>
              Download QR (SVG)
            </button>
          ) : null}
          <p className="muted" style={{ margin: 0 }}>
            Search engines are instructed not to index this page.
          </p>
        </aside>
      </div>

      <div className="contact-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
        {page.email_public ? (
          <a className="portal-card" href={`mailto:${page.email_public}`} style={{ padding: '0.7rem', textDecoration: 'none' }}>
            Email
          </a>
        ) : null}
        {page.phone_public ? (
          <a className="portal-card" href={`tel:${page.phone_public}`} style={{ padding: '0.7rem', textDecoration: 'none' }}>
            Phone
          </a>
        ) : null}
        {page.linkedin_url ? (
          <a className="portal-card" href={page.linkedin_url} target="_blank" rel="noreferrer" style={{ padding: '0.7rem', textDecoration: 'none' }}>
            LinkedIn
          </a>
        ) : null}
        {page.website_url ? (
          <a className="portal-card" href={page.website_url} target="_blank" rel="noreferrer" style={{ padding: '0.7rem', textDecoration: 'none' }}>
            Website
          </a>
        ) : null}
        {(page.links || []).map((link) => (
          <a
            key={`${link.label}-${link.url}`}
            className="portal-card"
            href={link.url}
            target="_blank"
            rel="noreferrer"
            style={{ padding: '0.7rem', textDecoration: 'none' }}
          >
            {link.label}
          </a>
        ))}
      </div>

      {events.length > 0 ? (
        <section style={{ display: 'grid', gap: '0.6rem' }}>
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
    </section>
  )
}
