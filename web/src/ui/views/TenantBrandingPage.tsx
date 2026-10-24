import { CmsImage } from '../components/media/CmsImage'
import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import Check from 'lucide-react/dist/esm/icons/check.mjs'
import Copy from 'lucide-react/dist/esm/icons/copy.mjs'
import Download from 'lucide-react/dist/esm/icons/download.mjs'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.mjs'
import { portalPath } from '../../config/portalBase'
import { getActivePortalProfileConfig, tenantProfileConfig } from '../../config/portalFeatures'
import { resolveBrandPalette } from '../../../../shared/brandPalette'
import lifetechBrand from '../../../../shared/lifetechBrand.json'
import { contrastRatio } from '../../../../shared/brandContrast'
import './brand-contrast.css'
import { downloadBrandGuide } from '../utils/downloadBrandGuide'
import { getGroupSite, type GroupSite } from '../../config/timebankCommunity'

function assetUrl(value?: string | null) {
  if (!value) return ''
  return value.startsWith('/') ? portalPath(value) : value
}

export function TenantBrandingPage({brandGuidePath='/branding',tenant:organizationTenant}:{brandGuidePath?:string;tenant?:GroupSite}={}) {
  const tenant = organizationTenant || getGroupSite()
  const profile = organizationTenant ? tenantProfileConfig(organizationTenant) : getActivePortalProfileConfig()
  const [copiedColor, setCopiedColor] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const copyResetTimer = useRef<number | null>(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = `Brand Guide | ${profile.brandName}`
    return () => { document.title = previousTitle }
  }, [profile.brandName])

  useEffect(() => () => {
    if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current)
  }, [])

  if (!tenant) return <Navigate to="/" replace />
  if (!organizationTenant && tenant.home_org_slug) return <Navigate to={`/orgs/${encodeURIComponent(tenant.home_org_slug)}?tab=branding`} replace />

  const nameBannerUrl = profile.nameBannerUrl
  const assets = [
    nameBannerUrl ? { id: 'namebanner', label: 'Name banner', description: 'Horizontal wordmark for wide brand placements.', url: assetUrl(nameBannerUrl) } : null,
    profile.brandImagePath
      ? { id: 'logo', label: 'Primary logo', description: 'Used in portal navigation, sign-in, favicons, and member-facing pages.', url: assetUrl(profile.brandImagePath) }
      : null,
    tenant.home_image_url && tenant.home_image_url !== profile.brandImagePath
      ? { id: 'hero', label: 'Portal cover image', description: 'Used as the organization portal cover and landing-page image.', url: assetUrl(tenant.home_image_url) }
      : null,
  ].filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))

  const colors = resolveBrandPalette({ ...tenant, profile: profile.id, theme_color: profile.themeColor })

  const brandColors = Object.fromEntries(lifetechBrand.colors.map(color => [color.id, color.value]))
  const accessiblePairs = profile.id === 'lifetech' ? lifetechBrand.pairings.map(pair => ({ ...pair, foreground: brandColors[pair.foreground], background: brandColors[pair.background], ratio: contrastRatio(brandColors[pair.foreground], brandColors[pair.background]) })) : []

  async function exportStyleGuide() {
    setExporting(true)
    setExportMessage('')
    try {
      await downloadBrandGuide({ name: profile.brandName, tagline: profile.tagline, colors,
        guidance: accessiblePairs.length ? ['WCAG 2.2 AA color contrast: 4.5:1 for ordinary text; 3:1 for large text and essential control indicators. Core BioTech Gold is an accent; use Gold Ink for gold text on light surfaces.', ...accessiblePairs.map(pair => `${pair.label}: ${pair.foreground} on ${pair.background} — ${pair.ratio.toFixed(2)}:1 (minimum ${pair.minimum}:1).`)] : [],
        url: new URL(portalPath(brandGuidePath), window.location.origin).href })
      setExportMessage('Style guide downloaded.')
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Could not download the style guide. Please try again.')
    } finally { setExporting(false) }
  }

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
        {profile.brandImagePath ? <CmsImage src={assetUrl(profile.brandImagePath)} alt="" /> : null}
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
            <CmsImage width={640} height={asset.id === 'namebanner' ? 214 : 640} style={{ objectFit: 'contain' }} src={asset.url} alt={`${profile.brandName} ${asset.label.toLowerCase()}`} />
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
        <button type="button" className="btn-secondary" disabled={exporting} onClick={() => void exportStyleGuide()}>
          <Download size={17} aria-hidden="true" /> {exporting ? 'Creating style guide…' : 'Download style guide (PNG)'}
        </button>
      </div>
      {exportMessage ? <p role="status">{exportMessage}</p> : null}
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
          <span className="tenant-brand-color-copy"><strong>{color.label}</strong><code>{color.value}</code>{color.description ? <small>{color.description}</small> : null}</span>
          <span className={`tenant-brand-copy-state${copiedColor === color.value ? ' is-copied' : ''}`} aria-live="polite">
            {copiedColor === color.value ? <><Check size={17} aria-hidden="true" />Copied</> : <Copy size={17} aria-hidden="true" />}
          </span>
        </button>)}
      </div>
    </section>

    {accessiblePairs.length > 0 && <section className="tenant-brand-section" aria-labelledby="tenant-brand-contrast-title">
      <div className="tenant-home-section-heading"><div><p className="tenant-home-eyebrow">Accessible use</p><h2 id="tenant-brand-contrast-title">Color pairings and contrast</h2></div></div>
      <p>Keep HealthTech Teal, MedTech OffWhite, and BioTech Gold as the core identity. Use the supporting shades for readable text and controls. BioTech Gold works on dark surfaces; use Gold Ink for text on light surfaces.</p>
      <p>WCAG 2.2 AA calls for at least 4.5:1 for ordinary text, 3:1 for large text, and 3:1 for essential control indicators. Pairing checks cover color contrast, not complete accessibility conformance.</p>
      <div className="tenant-brand-contrast-list">{accessiblePairs.map(pair => <article className="tenant-brand-contrast-pair" key={pair.label}>
        {pair.minimum === 3 ? <span className="tenant-brand-contrast-sample" style={{backgroundColor:pair.background}} aria-hidden="true"><span className="tenant-brand-control-sample" style={{borderColor:pair.foreground}}/></span> : <span className="tenant-brand-contrast-sample" style={{color:pair.foreground,backgroundColor:pair.background}} aria-hidden="true">Aa</span>}
        <div><strong>{pair.label}</strong><span>{pair.foreground} on {pair.background}</span></div><div className="tenant-brand-contrast-ratio"><strong>{pair.ratio.toFixed(2)}:1</strong><span>Minimum {pair.minimum}:1 · {pair.ratio>=pair.minimum?'Pass':'Needs adjustment'}</span></div>
      </article>)}</div>
      <p className="tenant-brand-contrast-reference">Reference: <a href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html">WCAG text contrast</a> and <a href="https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html">non-text contrast</a>. Check hover, focus, selected states, text over images, and any new color combination before use.</p>
    </section>}

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
