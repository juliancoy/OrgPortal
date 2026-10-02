import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { portalPath } from '../../config/portalBase'
import { getActivePortalProfileConfig } from '../../config/portalFeatures'
import { getDomainTenant } from '../../config/timebankCommunity'

function assetUrl(value?: string | null) {
  if (!value) return ''
  return value.startsWith('/') ? portalPath(value) : value
}

export function TenantBrandingPage() {
  const tenant = getDomainTenant()
  const profile = getActivePortalProfileConfig()
  const [copiedColor, setCopiedColor] = useState<string | null>(null)
  const copyResetTimer = useRef<number | null>(null)

  useEffect(() => {
    document.title = `Brand Guide | ${profile.brandName}`
  }, [profile.brandName])

  useEffect(() => () => {
    if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current)
  }, [])

  if (!tenant) return <Navigate to="/" replace />

  const assets = [
    profile.brandImagePath
      ? { id: 'logo', label: 'Primary logo', description: 'Used in portal navigation, sign-in, favicons, and member-facing pages.', url: assetUrl(profile.brandImagePath) }
      : null,
    tenant.home_image_url && tenant.home_image_url !== profile.brandImagePath
      ? { id: 'hero', label: 'Portal cover image', description: 'Used as the organization portal cover and landing-page image.', url: assetUrl(tenant.home_image_url) }
      : null,
  ].filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))

  const colors = [
    { label: 'Accent', value: tenant.accent_color },
    { label: 'Portal theme', value: profile.themeColor },
    { label: 'White', value: '#FFFFFF' },
  ].filter((color, index, list) => color.value && list.findIndex((item) => item.value.toLowerCase() === color.value.toLowerCase()) === index)

  async function copyColor(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedColor(value)
      if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current)
      copyResetTimer.current = window.setTimeout(() => setCopiedColor(null), 1600)
    } catch {
      setCopiedColor(null)
    }
  }

  return <article className="tenant-brand-page">
    <header className="tenant-brand-intro">
      <div>
        <p className="tenant-home-eyebrow">Brand guide</p>
        <h1>{profile.brandName}</h1>
        <p>{profile.tagline}</p>
      </div>
      <div className="tenant-brand-lockup" aria-label={`${profile.brandName} identity preview`}>
        {profile.brandImagePath ? <img src={assetUrl(profile.brandImagePath)} alt="" /> : null}
        <div>
          <strong>{profile.brandName}</strong>
          <span>{profile.tagline}</span>
        </div>
      </div>
    </header>

    {assets.length ? <section className="tenant-brand-section" aria-labelledby="tenant-brand-assets-title">
      <div className="tenant-home-section-heading">
        <div>
          <p className="tenant-home-eyebrow">Assets</p>
          <h2 id="tenant-brand-assets-title">Approved imagery</h2>
        </div>
      </div>
      <div className="tenant-brand-assets">
        {assets.map((asset) => <article className="tenant-brand-asset" key={asset.id}>
          <div className={`tenant-brand-asset-preview tenant-brand-asset-${asset.id}`}>
            <img src={asset.url} alt={`${profile.brandName} ${asset.label.toLowerCase()}`} />
          </div>
          <h3>{asset.label}</h3>
          <p>{asset.description}</p>
          <a href={asset.url} target="_blank" rel="noreferrer">
            Open asset <ExternalLink size={16} aria-hidden="true" />
          </a>
        </article>)}
      </div>
    </section> : null}

    <section className="tenant-brand-section" aria-labelledby="tenant-brand-colors-title">
      <div className="tenant-home-section-heading">
        <div>
          <p className="tenant-home-eyebrow">Color</p>
          <h2 id="tenant-brand-colors-title">Portal palette</h2>
        </div>
      </div>
      <div className="tenant-brand-colors">
        {colors.map((color) => <button
          type="button"
          className="tenant-brand-color"
          key={`${color.label}-${color.value}`}
          aria-label={`Copy ${color.label} color ${color.value}`}
          title="Copy hex value"
          onClick={() => void copyColor(color.value)}
        >
          <span className="tenant-brand-swatch" style={{ backgroundColor: color.value }} aria-hidden="true" />
          <span className="tenant-brand-color-copy"><strong>{color.label}</strong><code>{color.value}</code></span>
          <span className={`tenant-brand-copy-state${copiedColor === color.value ? ' is-copied' : ''}`} aria-live="polite">
            {copiedColor === color.value ? <><Check size={17} aria-hidden="true" />Copied</> : <Copy size={17} aria-hidden="true" />}
          </span>
        </button>)}
      </div>
    </section>

    <section className="tenant-brand-section" aria-labelledby="tenant-brand-details-title">
      <div className="tenant-home-section-heading">
        <div>
          <p className="tenant-home-eyebrow">Usage</p>
          <h2 id="tenant-brand-details-title">Portal identity</h2>
        </div>
      </div>
      <dl className="tenant-brand-details">
        <div><dt>Organization name</dt><dd>{profile.brandName}</dd></div>
        <div><dt>Tagline</dt><dd>{profile.tagline}</dd></div>
        <div><dt>Portal title</dt><dd>{profile.portalTitle}</dd></div>
        <div><dt>Public website</dt><dd><a href={profile.homeUrl}>{profile.homeUrl}</a></dd></div>
        <div><dt>Member sign-in</dt><dd><a href={portalPath('/users/login')}>{window.location.origin}{portalPath('/users/login')}</a></dd></div>
      </dl>
    </section>
  </article>
}
