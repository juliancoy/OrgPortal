import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { createQrSvg } from '../utils/qr'

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
  website_url?: string | null
  links?: ContactLink[]
  public_url?: string | null
}

export function ContactSettingsPage() {
  const { token } = useAuth()
  const [page, setPage] = useState<ContactPage | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [linksText, setLinksText] = useState('')

  useEffect(() => {
    document.title = 'Org Portal • Public profile settings'
  }, [])

  useEffect(() => {
    if (!token) return
    setStatus(null)
    fetch(orgUrl('/api/network/contact/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Failed to load contact page (${resp.status})`)
        }
        return resp.json() as Promise<ContactPage>
      })
      .then((data) => {
        setPage(data)
        setLinksText((data.links || []).map((item) => `${item.label}|${item.url}`).join('\n'))
      })
      .catch((err) => setStatus(err instanceof Error ? err.message : 'Failed to load contact page'))
  }, [token])

  const qrSvg = useMemo(() => {
    if (!page?.public_url) return null
    try {
      return createQrSvg(page.public_url, 6, 3)
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

  function setField<K extends keyof ContactPage>(field: K, value: ContactPage[K]) {
    setPage((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  async function save() {
    if (!token || !page) return
    setStatus(null)
    try {
      const parsedLinks = linksText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [label, url] = line.split('|').map((item) => item.trim())
          return { label, url }
        })
        .filter((item) => item.label && item.url)

      const resp = await fetch(orgUrl('/api/network/contact/me'), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: page.enabled,
          slug: page.slug,
          headline: page.headline || null,
          bio: page.bio || null,
          photo_url: page.photo_url || null,
          email_public: page.email_public || null,
          phone_public: page.phone_public || null,
          linkedin_url: page.linkedin_url || null,
          website_url: page.website_url || null,
          links: parsedLinks,
        }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Save failed (${resp.status})`)
      }
      const data = (await resp.json()) as ContactPage
      setPage(data)
      setStatus('Contact page saved.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed')
    }
  }

  if (!token) {
    return (
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Public Profile Settings</h1>
        <p className="muted">Sign in required.</p>
      </section>
    )
  }

  if (!page) {
    return (
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Public Profile Settings</h1>
        <p className="muted">Loading…</p>
        {status ? <p className="muted">{status}</p> : null}
      </section>
    )
  }

  return (
    <section className="panel" style={{ display: 'grid', gap: '0.75rem' }}>
        <h1 style={{ marginTop: 0 }}>Public Profile Settings</h1>
        <p className="muted" style={{ marginTop: 0 }}>
        Default is off. Enable to publish an opt-in public individual profile page with a shareable QR code.
        </p>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <Link to="/orgs/profile">Org Network</Link>
        {page.public_url ? (
          <a href={page.public_url} target="_blank" rel="noreferrer">
            Open Public Page
          </a>
        ) : null}
      </div>

      <label className="muted" style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={page.enabled}
          onChange={(e) => setField('enabled', e.target.checked)}
          style={{ width: 'auto' }}
        />
        Enable public profile
      </label>

      <input value={page.slug} onChange={(e) => setField('slug', e.target.value)} placeholder="Public slug" />
      <input value={page.headline || ''} onChange={(e) => setField('headline', e.target.value)} placeholder="Headline" />
      <textarea value={page.bio || ''} onChange={(e) => setField('bio', e.target.value)} rows={4} placeholder="Bio" />
      <input value={page.photo_url || ''} onChange={(e) => setField('photo_url', e.target.value)} placeholder="Photo URL" />
      <input value={page.email_public || ''} onChange={(e) => setField('email_public', e.target.value)} placeholder="Public email" />
      <input value={page.phone_public || ''} onChange={(e) => setField('phone_public', e.target.value)} placeholder="Public phone" />
      <input value={page.linkedin_url || ''} onChange={(e) => setField('linkedin_url', e.target.value)} placeholder="LinkedIn URL" />
      <input value={page.website_url || ''} onChange={(e) => setField('website_url', e.target.value)} placeholder="Website URL" />
      <textarea
        value={linksText}
        onChange={(e) => setLinksText(e.target.value)}
        rows={5}
        placeholder={'Extra links, one per line: Label|https://example.com'}
      />

      <div>
        <button type="button" onClick={save}>Save Public Profile</button>
      </div>

      {status ? <p className="muted">{status}</p> : null}

      {page.public_url ? (
        <div className="portal-card" style={{ display: 'grid', gap: '0.5rem', justifyItems: 'start' }}>
          <div className="muted">Public URL</div>
          <a href={page.public_url} target="_blank" rel="noreferrer">{page.public_url}</a>
          {qrSvg ? (
            <div
              aria-label="QR code for contact page"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : null}
          {qrSvg ? (
            <button type="button" onClick={downloadQrSvg}>
              Download QR (SVG)
            </button>
          ) : null}
          <p className="muted" style={{ margin: 0 }}>
            Public individual profile pages are published with no-index metadata.
          </p>
        </div>
      ) : null}
    </section>
  )
}
