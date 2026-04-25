import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

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
}

export function PublicContactPage() {
  const { slug } = useParams()
  const [page, setPage] = useState<ContactPage | null>(null)
  const [status, setStatus] = useState<string>('Loading…')

  useEffect(() => {
    document.title = `Contact • ${slug ?? ''}`
  }, [slug])

  useEffect(() => {
    if (!slug) return
    fetch(orgUrl(`/api/network/contact/${encodeURIComponent(slug)}`))
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Contact page not found (${resp.status})`)
        }
        return resp.json() as Promise<ContactPage>
      })
      .then((data) => {
        setPage(data)
        setStatus('')
      })
      .catch((err) => {
        setPage(null)
        setStatus(err instanceof Error ? err.message : 'Contact page unavailable')
      })
  }, [slug])

  if (!page) {
    return (
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Contact Page</h1>
        <p className="muted">{status}</p>
      </section>
    )
  }

  return (
    <section className="panel" style={{ display: 'grid', gap: '0.8rem' }}>
      <h1 style={{ marginTop: 0 }}>{page.user_name}</h1>
      {page.photo_url ? (
        <img
          src={page.photo_url}
          alt={page.user_name}
          style={{ width: '100%', maxWidth: 360, borderRadius: 12, border: '2px solid var(--border)' }}
        />
      ) : null}
      {page.headline ? <p><strong>{page.headline}</strong></p> : null}
      {page.bio ? <p>{page.bio}</p> : null}

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
    </section>
  )
}
