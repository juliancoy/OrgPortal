import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { publicProfileUrl } from '../../config/portalBase'
import { createQrSvg } from '../utils/qr'

const ORG_API_BASE = '/api/org'
const THEME_STORAGE_KEY = 'orgportal.theme'

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
  source_profile_url?: string | null
  source_profile_imported_at?: string | null
  links?: ContactLink[]
  public_url?: string | null
}

type ContactSettingsPageProps = {
  embedded?: boolean
  hideQr?: boolean
  profileImageEditor?: ReactNode
}

type PublicVisibilityKey =
  | 'headline'
  | 'bio'
  | 'email_public'
  | 'phone_public'
  | 'linkedin_url'
  | 'github_url'
  | 'x_url'
  | 'website_url'
  | 'links'

type PublicVisibility = Record<PublicVisibilityKey, boolean>

const DEFAULT_PUBLIC_VISIBILITY: PublicVisibility = {
  headline: false,
  bio: false,
  email_public: false,
  phone_public: false,
  linkedin_url: false,
  github_url: false,
  x_url: false,
  website_url: false,
  links: false,
}

function contactVisibilityFromPage(page: ContactPage): PublicVisibility {
  return {
    headline: Boolean(page.headline?.trim()),
    bio: Boolean(page.bio?.trim()),
    email_public: Boolean(page.email_public?.trim()),
    phone_public: Boolean(page.phone_public?.trim()),
    linkedin_url: Boolean(page.linkedin_url?.trim()),
    github_url: Boolean(page.github_url?.trim()),
    x_url: Boolean(page.x_url?.trim()),
    website_url: Boolean(page.website_url?.trim()),
    links: Boolean(page.links?.length),
  }
}

export function ContactSettingsPage({ embedded = false, hideQr = false, profileImageEditor }: ContactSettingsPageProps = {}) {
  const { token } = useAuth()
  const [page, setPage] = useState<ContactPage | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [linksText, setLinksText] = useState('')
  const [publicVisibility, setPublicVisibility] = useState<PublicVisibility>(DEFAULT_PUBLIC_VISIBILITY)
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return raw === 'light' ? 'light' : 'dark'
  })
  const [themeStatus, setThemeStatus] = useState<string | null>(null)
  const [importUrl, setImportUrl] = useState('https://codecollective.us/personnel/juliancoy.html')

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
          throw new Error(text || `Failed to load public profile (${resp.status})`)
        }
        return resp.json() as Promise<ContactPage>
      })
      .then((data) => {
        setPage(data)
        setLinksText((data.links || []).map((item) => `${item.label}|${item.url}`).join('\n'))
        setPublicVisibility(contactVisibilityFromPage(data))
        if (data.source_profile_url) {
          setImportUrl(data.source_profile_url)
        }
      })
      .catch((err) => setStatus(err instanceof Error ? err.message : 'Failed to load public profile'))
  }, [token])

  const publicUrl = useMemo(() => publicProfileUrl(page?.slug), [page?.slug])
  const qrSvg = useMemo(() => {
    if (!publicUrl) return null
    try {
      return createQrSvg(publicUrl, 6, 3)
    } catch {
      return null
    }
  }, [publicUrl])

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

  function setVisibility(field: PublicVisibilityKey, visible: boolean) {
    setPublicVisibility((prev) => ({ ...prev, [field]: visible }))
  }

  function publicFieldClass(field: PublicVisibilityKey, value?: string | null) {
    const willShow = publicVisibility[field] && Boolean(String(value || '').trim())
    return `contact-public-field ${willShow ? 'is-public' : 'is-private'}`
  }

  function publicLinksFieldClass() {
    const willShow = publicVisibility.links && Boolean(linksText.trim())
    return `contact-public-field ${willShow ? 'is-public' : 'is-private'}`
  }

  function visibilityButton(field: PublicVisibilityKey) {
    const visible = publicVisibility[field]
    return (
      <button
        type="button"
        className={`contact-public-visibility-button ${visible ? 'is-public' : 'is-private'}`}
        onClick={() => setVisibility(field, !visible)}
        aria-label={visible ? 'Hide from public profile' : 'Show on public profile'}
        title={visible ? 'Hide from public profile' : 'Show on public profile'}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          {visible ? (
            <>
              <path d="M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5Z" stroke="currentColor" strokeWidth="1.7" />
              <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.7" />
            </>
          ) : (
            <>
              <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M2.5 10s2.7-5 7.5-5c1.2 0 2.3.3 3.2.8M16 8.2c1 .9 1.5 1.8 1.5 1.8s-2.7 5-7.5 5c-1.1 0-2.1-.3-3-.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>
    )
  }

  function saveTheme(nextMode: 'dark' | 'light') {
    setThemeMode(nextMode)
    localStorage.setItem(THEME_STORAGE_KEY, nextMode)
    document.documentElement.setAttribute('data-theme', nextMode)
    setThemeStatus(`Theme set to ${nextMode}.`)
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
          headline: publicVisibility.headline ? page.headline || null : null,
          bio: publicVisibility.bio ? page.bio || null : null,
          email_public: publicVisibility.email_public ? page.email_public || null : null,
          phone_public: publicVisibility.phone_public ? page.phone_public || null : null,
          linkedin_url: publicVisibility.linkedin_url ? page.linkedin_url || null : null,
          github_url: publicVisibility.github_url ? page.github_url || null : null,
          x_url: publicVisibility.x_url ? page.x_url || null : null,
          website_url: publicVisibility.website_url ? page.website_url || null : null,
          links: publicVisibility.links ? parsedLinks : [],
        }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Save failed (${resp.status})`)
      }
      const data = (await resp.json()) as ContactPage
      setPage(data)
      setLinksText((data.links || []).map((item) => `${item.label}|${item.url}`).join('\n'))
      setPublicVisibility(contactVisibilityFromPage(data))
      setStatus('Public profile saved.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed')
    }
  }

  async function importFromUrl() {
    if (!token || !page) return
    setStatus(null)
    try {
      const cleaned = importUrl.trim()
      if (!cleaned) {
        throw new Error('Provide a source URL first.')
      }
      const resp = await fetch(orgUrl('/api/network/contact/me/import'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_url: cleaned,
          overwrite: true,
        }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Import failed (${resp.status})`)
      }
      const data = (await resp.json()) as {
        contact: ContactPage
        imported_fields: string[]
        source_url: string
      }
      setPage(data.contact)
      setImportUrl(data.source_url)
      setLinksText((data.contact.links || []).map((item) => `${item.label}|${item.url}`).join('\n'))
      setPublicVisibility(contactVisibilityFromPage(data.contact))
      if (data.imported_fields.length > 0) {
        setStatus(`Imported: ${data.imported_fields.join(', ')}`)
      } else {
        setStatus('Imported with no changes.')
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed')
    }
  }

  if (!token) {
    return (
      <section className={embedded ? 'profile-settings-section' : 'panel'}>
        {embedded ? <h2 style={{ marginTop: 0 }}>Public Profile</h2> : <h1 style={{ marginTop: 0 }}>Public Profile Settings</h1>}
        <p className="muted">Sign in required.</p>
      </section>
    )
  }

  if (!page) {
    return (
      <section className={embedded ? 'profile-settings-section' : 'panel'}>
        {embedded ? <h2 style={{ marginTop: 0 }}>Public Profile</h2> : <h1 style={{ marginTop: 0 }}>Public Profile Settings</h1>}
        <p className="muted">Loading…</p>
        {status ? <p className="muted">{status}</p> : null}
      </section>
    )
  }

  return (
    <section className={embedded ? 'profile-settings-section' : 'panel'} style={{ display: 'grid', gap: '0.75rem' }}>
      {embedded ? (
        <div>
          <h2 style={{ margin: 0 }}>Public Profile</h2>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Manage the contact details shown on your public page.
          </p>
        </div>
      ) : null}

      {!embedded ? <div className="contact-settings-actions">
        {page.enabled && publicUrl ? (
          <a className="contact-public-page-bubble" href={publicUrl} target="_blank" rel="noreferrer">
            Open Public Page
          </a>
        ) : null}
      </div> : null}

      <div className="portal-card" style={{ padding: '0.65rem', display: 'grid', gap: '0.25rem' }}>
        <div className="muted" style={{ margin: 0 }}>User UUID</div>
        <code style={{ wordBreak: 'break-all' }}>{page.user_id}</code>
      </div>

      <section className="portal-card" style={{ display: 'grid', gap: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Appearance</h2>
        <p className="muted" style={{ margin: 0 }}>Light mode can only be enabled here.</p>
        <label className="muted" style={{ display: 'grid', gap: '0.3rem' }}>
          Theme
          <select
            value={themeMode}
            onChange={(e) => saveTheme(e.target.value as 'dark' | 'light')}
            style={{ maxWidth: 220 }}
          >
            <option value="dark">Dark (default)</option>
            <option value="light">Light</option>
          </select>
        </label>
        {themeStatus ? <p className="muted" style={{ margin: 0 }}>{themeStatus}</p> : null}
      </section>

      <section className="portal-card contact-public-profile-card">
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Public Profile</h2>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            {page.enabled ? 'Your public profile is enabled.' : 'Your public profile is disabled.'}
          </p>
        </div>
        <button
          type="button"
          className={`contact-public-profile-toggle ${page.enabled ? 'is-disable' : 'is-enable'}`}
          onClick={() => setField('enabled', !page.enabled)}
        >
          {page.enabled ? 'Disable' : 'Enable'}
        </button>
      </section>

      <input value={page.slug} onChange={(e) => setField('slug', e.target.value)} placeholder="Public slug" />
      <div className={publicFieldClass('headline', page.headline)}>
        <input value={page.headline || ''} onChange={(e) => setField('headline', e.target.value)} placeholder="Headline" />
        {visibilityButton('headline')}
      </div>
      <div className={publicFieldClass('bio', page.bio)}>
        <textarea value={page.bio || ''} onChange={(e) => setField('bio', e.target.value)} rows={4} placeholder="Bio" />
        {visibilityButton('bio')}
      </div>
      {profileImageEditor ?? (
        <div className="portal-card" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="portal-avatar" style={{ width: 56, height: 56 }}>
            {page.photo_url ? <img src={page.photo_url} alt={page.user_name} /> : page.user_name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <div style={{ fontWeight: 700 }}>Profile image</div>
            <p className="muted" style={{ margin: 0 }}>Managed from your user profile.</p>
            <Link to="/profile">Edit profile image</Link>
          </div>
        </div>
      )}
      <div className={publicFieldClass('email_public', page.email_public)}>
        <input value={page.email_public || ''} onChange={(e) => setField('email_public', e.target.value)} placeholder="Public email" />
        {visibilityButton('email_public')}
      </div>
      <div className={publicFieldClass('phone_public', page.phone_public)}>
        <input value={page.phone_public || ''} onChange={(e) => setField('phone_public', e.target.value)} placeholder="Public phone" />
        {visibilityButton('phone_public')}
      </div>
      <div className={publicFieldClass('linkedin_url', page.linkedin_url)}>
        <input value={page.linkedin_url || ''} onChange={(e) => setField('linkedin_url', e.target.value)} placeholder="LinkedIn URL" />
        {visibilityButton('linkedin_url')}
      </div>
      <div className={publicFieldClass('github_url', page.github_url)}>
        <input value={page.github_url || ''} onChange={(e) => setField('github_url', e.target.value)} placeholder="GitHub URL" />
        {visibilityButton('github_url')}
      </div>
      <div className={publicFieldClass('x_url', page.x_url)}>
        <input value={page.x_url || ''} onChange={(e) => setField('x_url', e.target.value)} placeholder="X / Twitter URL" />
        {visibilityButton('x_url')}
      </div>
      <div className={publicFieldClass('website_url', page.website_url)}>
        <input value={page.website_url || ''} onChange={(e) => setField('website_url', e.target.value)} placeholder="Website URL" />
        {visibilityButton('website_url')}
      </div>
      <div className={publicLinksFieldClass()}>
        <textarea
          value={linksText}
          onChange={(e) => setLinksText(e.target.value)}
          rows={5}
          placeholder={'Extra links, one per line: Label|https://example.com'}
        />
        {visibilityButton('links')}
      </div>

      <div>
        <button type="button" onClick={save}>Save Public Profile</button>
      </div>

      <section className="portal-card" style={{ display: 'grid', gap: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Import From Existing Profile URL</h2>
        <p className="muted" style={{ margin: 0 }}>
          Uses your current login token to fetch a public page and auto-fill profile fields.
        </p>
        <input
          value={importUrl}
          onChange={(e) => setImportUrl(e.target.value)}
          placeholder="https://example.com/profile"
        />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={importFromUrl}>Import From URL</button>
          {page.source_profile_url ? (
            <a href={page.source_profile_url} target="_blank" rel="noreferrer">Last Imported Source</a>
          ) : null}
        </div>
      </section>

      {status ? <p className="muted">{status}</p> : null}

      {publicUrl ? (
        <div className="portal-card" style={{ display: 'grid', gap: '0.5rem', justifyItems: 'start' }}>
          <div className="muted">Public URL</div>
          {page.enabled ? (
            <a href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</a>
          ) : (
            <span className="muted">{publicUrl} (not published yet)</span>
          )}
          {!hideQr && qrSvg ? (
            <div
              aria-label="QR code for public profile"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : null}
          {!hideQr && qrSvg ? (
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
