import { parseOrganizationThemes, portalThemeColors, type OrganizationThemeImagery } from '../../../../shared/organizationThemes'
import { CmsImage } from '../components/media/CmsImage'
import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import Check from 'lucide-react/dist/esm/icons/check.mjs'
import Copy from 'lucide-react/dist/esm/icons/copy.mjs'
import Download from 'lucide-react/dist/esm/icons/download.mjs'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.mjs'
import { portalPath } from '../../config/portalBase'
import { getActivePortalProfileConfig, tenantProfileConfig } from '../../config/portalFeatures'
import { resolveBrandPalette, type BrandColor } from '../../../../shared/brandPalette'
import lifetechBrand from '../../../../shared/lifetechBrand.json'
import { contrastRatio } from '../../../../shared/brandContrast'
import './brand-contrast.css'
import { downloadBrandGuide } from '../utils/downloadBrandGuide'
import { getGroupSite, type GroupSite } from '../../config/timebankCommunity'

function assetUrl(value?: string | null) {
  if (!value) return ''
  return value.startsWith('/') ? portalPath(value) : value
}

export function TenantBrandingPage({brandGuidePath='/branding',tenant:organizationTenant,embedded=false,imageryOverride,selectedThemeId,onThemeChange}:{brandGuidePath?:string;tenant?:GroupSite;embedded?:boolean;imageryOverride?:OrganizationThemeImagery;selectedThemeId?:string;onThemeChange?:(id:string)=>void}={}) {
  const tenant = organizationTenant || getGroupSite()
  const profile = organizationTenant ? tenantProfileConfig(organizationTenant) : getActivePortalProfileConfig()
  const brandThemes = parseOrganizationThemes(tenant?.feature_config?.brandThemes)
  const [themeId, setThemeId] = useState('')
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('light')
  const selectedTheme = brandThemes?.themes.find(theme => theme.id === (selectedThemeId||themeId)) || brandThemes?.themes.find(theme => theme.id === brandThemes.defaultTheme)
  const themeColors = selectedTheme ? portalThemeColors(selectedTheme[colorMode]) : null
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

  useEffect(() => { setThemeId('') }, [brandThemes?.defaultTheme])

  if (!tenant) return <Navigate to="/" replace />
  if (!organizationTenant && tenant.home_org_slug) return <Navigate to={`/orgs/${encodeURIComponent(tenant.home_org_slug)}?tab=branding`} replace />

  const imagery = imageryOverride || selectedTheme?.imagery
  const nameBannerUrl = selectedTheme?.imagery ? null : profile.nameBannerUrl
  const identityImage = imagery?.icon || profile.brandImagePath
  const assets = [
    nameBannerUrl ? { id: 'namebanner', label: 'Name banner', description: 'Horizontal wordmark for wide brand placements.', url: assetUrl(nameBannerUrl) } : null,
    !imagery && profile.brandImagePath
      ? { id: 'logo', label: 'Primary logo', description: 'Used in portal navigation, sign-in, favicons, and member-facing pages.', url: assetUrl(profile.brandImagePath) }
      : null,
    !imagery && tenant.home_image_url && tenant.home_image_url !== profile.brandImagePath
      ? { id: 'hero', label: 'Portal cover image', description: 'Used as the organization portal cover and landing-page image.', url: assetUrl(tenant.home_image_url) }
      : null,
    ...(imagery ? [
      {id:'icon',label:'Brand icon',description:'Navigation and favicon imagery.',url:assetUrl(imagery.icon)},
      {id:'avatar',label:'Organization avatar',description:'Profile and directory imagery.',url:assetUrl(imagery.avatar)},
      {id:'background',label:'Standard background',description:'Organization cover and standard backdrop.',url:assetUrl(imagery.background)},
    ] : []),
  ].filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))

  const palette = resolveBrandPalette({ ...tenant, profile: profile.id, theme_color: profile.themeColor })
  const colors: BrandColor[] = [...palette, ...Object.entries(selectedTheme?.[colorMode] || {}).map(([label, value]) => ({ label: `${selectedTheme!.name} ${colorMode}: ${label}`, value }))]

  const brandColors = Object.fromEntries(lifetechBrand.colors.flatMap(color => {
    const configured = palette.find(item => item.label === color.label)
    return configured ? [[color.id, configured.value]] : []
  }))
  const accessiblePairs = themeColors ? [
    { label: 'Body text', foreground: themeColors['text-primary'], background: themeColors.surface, minimum: 4.5 },
    { label: 'Panel text', foreground: themeColors['text-primary'], background: themeColors.panel, minimum: 4.5 },
    { label: 'Secondary text', foreground: themeColors['text-secondary'], background: themeColors.surface, minimum: 4.5 },
    { label: 'Links', foreground: themeColors.primary, background: themeColors.surface, minimum: 4.5 },
    { label: 'Primary button', foreground: themeColors['on-primary'] || themeColors['btn-primary-text'], background: themeColors['btn-primary-bg'], minimum: 4.5 },
  ].filter((pair): pair is typeof pair & {foreground: string; background: string} => Boolean(pair.foreground && pair.background)).map(pair => ({ ...pair, ratio: contrastRatio(pair.foreground, pair.background) })) : profile.id === 'lifetech' ? lifetechBrand.pairings.filter(pair => brandColors[pair.foreground] && brandColors[pair.background]).map(pair => ({ ...pair, foreground: brandColors[pair.foreground], background: brandColors[pair.background], ratio: contrastRatio(brandColors[pair.foreground], brandColors[pair.background]) })) : []

  async function exportStyleGuide() {
    setExporting(true)
    setExportMessage('')
    try {
      await downloadBrandGuide({ name: profile.brandName, tagline: profile.tagline, colors, paper: themeColors?.surface, ink: themeColors?.['text-primary'],
        guidance: accessiblePairs.length ? ['WCAG 2.2 AA color contrast: 4.5:1 for ordinary text; 3:1 for large text and essential control indicators. Check the selected portal palette in both light and dark modes.', ...accessiblePairs.map(pair => `${pair.label}: ${pair.foreground} on ${pair.background} — ${pair.ratio.toFixed(2)}:1 (minimum ${pair.minimum}:1).`)] : [],
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
    {!embedded && <header className="tenant-brand-intro">
      <div>
        <p className="tenant-home-eyebrow">Brand guide</p>
        <h1>{profile.brandName}</h1>
        <p>{profile.tagline}</p>
      </div>
      <div className="tenant-brand-lockup" aria-label={`${profile.brandName} identity preview`}>
        {identityImage ? <CmsImage src={assetUrl(identityImage)} alt="" /> : null}
        <div>
          <strong>{profile.brandName}</strong>
          <span>{profile.tagline}</span>
        </div>
      </div>
    </header>}

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
      {brandThemes ? <div className="tenant-brand-theme-controls">
        <label>Theme <select aria-label="Brand guide theme" value={selectedTheme?.id} onChange={event => onThemeChange?onThemeChange(event.target.value):setThemeId(event.target.value)}>
          {brandThemes.themes.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
        </select></label>
        <label>Color mode <select aria-label="Brand guide color mode" value={colorMode} onChange={event => setColorMode(event.target.value as 'light' | 'dark')}>
          <option value="light">Light</option><option value="dark">Dark</option>
        </select></label>
      </div> : null}
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
      {selectedTheme ? <p>Pairings use {selectedTheme.name} in {colorMode} mode from the portal palette.</p> : <p>Keep HealthTech Teal, MedTech OffWhite, and BioTech Gold as the core identity. Use the supporting shades for readable text and controls. BioTech Gold works on dark surfaces; use Gold Ink for text on light surfaces.</p>}
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
