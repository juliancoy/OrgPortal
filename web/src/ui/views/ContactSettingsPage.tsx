import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { publicProfileUrl } from '../../config/portalBase'
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
  hideProfileImage?: boolean
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
type SaveState = 'saved' | 'pending' | 'saving' | 'error'

type ContactSavePayload = {
  enabled: boolean
  slug: string
  headline: string | null
  bio: string | null
  email_public: string | null
  phone_public: string | null
  linkedin_url: string | null
  github_url: string | null
  x_url: string | null
  website_url: string | null
  links: ContactLink[]
}

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

function contactLinksToText(links?: ContactLink[]) {
  return (links || []).map((item) => `${item.label}|${item.url}`).join('\n')
}

function parseLinksText(text: string): ContactLink[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, url] = line.split('|').map((item) => item.trim())
      return { label, url }
    })
    .filter((item) => item.label && item.url)
}

function savePayload(page: ContactPage, publicVisibility: PublicVisibility, linksText: string): ContactSavePayload {
  const parsedLinks = parseLinksText(linksText)
  return {
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
  }
}

function payloadKey(payload: ContactSavePayload) {
  return JSON.stringify(payload)
}

export function ContactSettingsPage({ embedded = false, hideQr = false, hideProfileImage = false, profileImageEditor }: ContactSettingsPageProps = {}) {
  const { token } = useAuth()
  const [page, setPage] = useState<ContactPage | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [linksText, setLinksText] = useState('')
  const [publicVisibility, setPublicVisibility] = useState<PublicVisibility>(DEFAULT_PUBLIC_VISIBILITY)
  const [importUrl, setImportUrl] = useState('https://codecollective.us/personnel/juliancoy.html')
  const [savedPayloadKey, setSavedPayloadKey] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const autosaveTimer = useRef<number | null>(null)
  const saveSequence = useRef(0)

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
        const visibility = contactVisibilityFromPage(data)
        const nextLinksText = contactLinksToText(data.links)
        setPage(data)
        setLinksText(nextLinksText)
        setPublicVisibility(visibility)
        setSavedPayloadKey(payloadKey(savePayload(data, visibility, nextLinksText)))
        setSaveState('saved')
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

  function setPublicField(field: PublicVisibilityKey, value: string) {
    setPage((prev) => (prev ? { ...prev, [field]: value } : prev))
    if (value.trim()) {
      setPublicVisibility((prev) => ({ ...prev, [field]: true }))
    }
  }

  function setPublicLinks(value: string) {
    setLinksText(value)
    if (value.trim()) {
      setPublicVisibility((prev) => ({ ...prev, links: true }))
    }
  }

  function setVisibility(field: PublicVisibilityKey, visible: boolean) {
    setPublicVisibility((prev) => ({ ...prev, [field]: visible }))
  }

  const currentPayload = useMemo(
    () => (page ? savePayload(page, publicVisibility, linksText) : null),
    [linksText, page, publicVisibility],
  )

  const currentPayloadKey = useMemo(() => (currentPayload ? payloadKey(currentPayload) : null), [currentPayload])

  useEffect(() => {
    if (!token || !page || !currentPayload || !currentPayloadKey || savedPayloadKey === null) return
    if (currentPayloadKey === savedPayloadKey) {
      setSaveState('saved')
      return
    }

    setSaveState('pending')
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    const sequence = saveSequence.current + 1
    saveSequence.current = sequence
    autosaveTimer.current = window.setTimeout(async () => {
      setSaveState('saving')
      try {
        const resp = await fetch(orgUrl('/api/network/contact/me'), {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(currentPayload),
        })
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Save failed (${resp.status})`)
        }
        const data = (await resp.json()) as ContactPage
        if (saveSequence.current !== sequence) return
        const visibility = contactVisibilityFromPage(data)
        const nextLinksText = contactLinksToText(data.links)
        const nextPayloadKey = payloadKey(savePayload(data, visibility, nextLinksText))
        setPage(data)
        setPublicVisibility(visibility)
        setLinksText(nextLinksText)
        setSavedPayloadKey(nextPayloadKey)
        setSaveState('saved')
        setStatus('Public profile updated.')
      } catch (err) {
        if (saveSequence.current !== sequence) return
        setSaveState('error')
        setStatus(err instanceof Error ? err.message : 'Save failed')
      }
    }, 800)

    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current)
        autosaveTimer.current = null
      }
    }
  }, [currentPayload, currentPayloadKey, page, savedPayloadKey, token])

  function publicFieldClass(field: PublicVisibilityKey, value?: string | null) {
    const willShow = publicVisibility[field] && Boolean(String(value || '').trim())
    return `contact-public-field ${willShow ? 'is-public' : 'is-private'} ${fieldStateClass(field)}`
  }

  function publicLinksFieldClass() {
    const willShow = publicVisibility.links && Boolean(linksText.trim())
    return `contact-public-field ${willShow ? 'is-public' : 'is-private'} ${fieldStateClass('links')}`
  }

  function fieldStateClass(field: PublicVisibilityKey | 'slug' | 'enabled') {
    if (!page || !currentPayload || !savedPayloadKey || saveState === 'error') return 'save-error'
    const saved = currentPayloadKey === savedPayloadKey
    const savedPayload = JSON.parse(savedPayloadKey) as ContactSavePayload
    if (field === 'links') {
      return saved || JSON.stringify(currentPayload.links) === JSON.stringify(savedPayload.links) ? 'save-saved' : 'save-pending'
    }
    return saved || currentPayload[field] === savedPayload[field] ? 'save-saved' : 'save-pending'
  }

  function saveLabel() {
    if (saveState === 'pending') return 'Unsaved changes'
    if (saveState === 'saving') return 'Saving...'
    if (saveState === 'error') return 'Save failed'
    return 'Saved'
  }

  function visibilityButton(field: PublicVisibilityKey) {
    const visible = publicVisibility[field]
    return (
      <button
        type="button"
        className={`contact-public-visibility-button ${visible ? 'is-public' : 'is-private'}`}
        onClick={() => setVisibility(field, !visible)}
        aria-label={visible ? 'Hide from public profile' : 'Show on public profile'}
        aria-pressed={visible}
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
      const nextLinksText = contactLinksToText(data.contact.links)
      const visibility = contactVisibilityFromPage(data.contact)
      setLinksText(nextLinksText)
      setPublicVisibility(visibility)
      setSavedPayloadKey(payloadKey(savePayload(data.contact, visibility, nextLinksText)))
      setSaveState('saved')
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


      <section className="portal-card contact-public-profile-card">
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Public Profile</h2>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            {page.enabled ? 'Your public profile is enabled.' : 'Your public profile is disabled.'}
          </p>
          <p className={`contact-autosave-status ${saveState}`} role="status">
            {saveLabel()}
          </p>
        </div>
        <button
          type="button"
          className={`contact-public-profile-toggle ${page.enabled ? 'is-disable' : 'is-enable'} ${fieldStateClass('enabled')}`}
          onClick={() => setField('enabled', !page.enabled)}
        >
          {page.enabled ? 'Disable' : 'Enable'}
        </button>

        {!embedded ? <div className="contact-settings-actions">
          {page.enabled && publicUrl ? (
            <a className="contact-public-page-bubble" href={publicUrl} target="_blank" rel="noreferrer">
              Open
            </a>
          ) : null}
        </div> : null}

      </section>


      <div className={publicFieldClass('headline', page.headline)}>
        <label className="sr-only" htmlFor="contact-headline">Headline</label>
        <input id="contact-headline" value={page.headline || ''} onChange={(e) => setPublicField('headline', e.target.value)} placeholder="Headline" />
        {visibilityButton('headline')}
      </div>
      <div className={publicFieldClass('bio', page.bio)}>
        <label className="sr-only" htmlFor="contact-bio">Bio</label>
        <textarea id="contact-bio" value={page.bio || ''} onChange={(e) => setPublicField('bio', e.target.value)} rows={4} placeholder="Bio" />
        {visibilityButton('bio')}
      </div>
      {!hideProfileImage && (profileImageEditor ?? (
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
      ))}
      <div className={publicFieldClass('email_public', page.email_public)}>
        <label className="sr-only" htmlFor="contact-public-email">Public email</label>
        <input id="contact-public-email" value={page.email_public || ''} onChange={(e) => setPublicField('email_public', e.target.value)} placeholder="Public email" />
        {visibilityButton('email_public')}
      </div>
      <div className={publicFieldClass('phone_public', page.phone_public)}>
        <label className="sr-only" htmlFor="contact-public-phone">Public phone</label>
        <input id="contact-public-phone" value={page.phone_public || ''} onChange={(e) => setPublicField('phone_public', e.target.value)} placeholder="Public phone" />
        {visibilityButton('phone_public')}
      </div>
      <div className={publicFieldClass('linkedin_url', page.linkedin_url)}>
        <label className="sr-only" htmlFor="contact-linkedin-url">LinkedIn URL</label>
        <input id="contact-linkedin-url" value={page.linkedin_url || ''} onChange={(e) => setPublicField('linkedin_url', e.target.value)} placeholder="LinkedIn URL" />
        {visibilityButton('linkedin_url')}
      </div>
      <div className={publicFieldClass('github_url', page.github_url)}>
        <label className="sr-only" htmlFor="contact-github-url">GitHub URL</label>
        <input id="contact-github-url" value={page.github_url || ''} onChange={(e) => setPublicField('github_url', e.target.value)} placeholder="GitHub URL" />
        {visibilityButton('github_url')}
      </div>
      <div className={publicFieldClass('x_url', page.x_url)}>
        <label className="sr-only" htmlFor="contact-x-url">X / Twitter URL</label>
        <input id="contact-x-url" value={page.x_url || ''} onChange={(e) => setPublicField('x_url', e.target.value)} placeholder="X / Twitter URL" />
        {visibilityButton('x_url')}
      </div>
      <div className={publicFieldClass('website_url', page.website_url)}>
        <label className="sr-only" htmlFor="contact-website-url">Website URL</label>
        <input id="contact-website-url" value={page.website_url || ''} onChange={(e) => setPublicField('website_url', e.target.value)} placeholder="Website URL" />
        {visibilityButton('website_url')}
      </div>
      <div className={publicLinksFieldClass()}>
        <label className="sr-only" htmlFor="contact-extra-links">Extra links</label>
        <textarea
          id="contact-extra-links"
          value={linksText}
          onChange={(e) => setPublicLinks(e.target.value)}
          rows={5}
          placeholder={'Extra links, one per line: Label|https://example.com'}
        />
        {visibilityButton('links')}
      </div>

      {!embedded ? <section className="portal-card" style={{ display: 'grid', gap: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Import From Existing Profile URL</h2>
        <p className="muted" style={{ margin: 0 }}>
          Uses your current login token to fetch a public page and auto-fill profile fields.
        </p>
        <input
          id="contact-import-url"
          value={importUrl}
          onChange={(e) => setImportUrl(e.target.value)}
          placeholder="https://example.com/profile"
          aria-label="Profile URL to import"
        />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={importFromUrl}>Import From URL</button>
          {page.source_profile_url ? (
            <a href={page.source_profile_url} target="_blank" rel="noreferrer">Last Imported Source</a>
          ) : null}
        </div>
      </section> : null}

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

      <label className={`profile-bottom-field contact-save-outline ${fieldStateClass('slug')}`}>
        <span className="muted">Public slug</span>
        <input value={page.slug} onChange={(e) => setField('slug', e.target.value)} placeholder="Public slug" />
      </label>
    </section>
  )
}
