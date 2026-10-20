export type BrandColor = { label: string; value: string; description?: string }

export function parseBrandPalette(value: unknown): BrandColor[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return null
  const colors: BrandColor[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const color = item as Record<string, unknown>
    if (typeof color.label !== 'string' || !color.label.trim() || color.label.length > 80
      || typeof color.value !== 'string' || !/^#[0-9a-f]{6}$/i.test(color.value)
      || (color.description !== undefined && (typeof color.description !== 'string' || color.description.length > 300))) return null
    colors.push({ label: color.label.trim(), value: color.value, ...(typeof color.description === 'string' ? { description: color.description } : {}) })
  }
  return colors
}

export function resolveBrandPalette(site: { profile?: string | null; slug?: string | null; home_org_slug?: string | null; accent_color?: string | null; theme_color?: string | null; feature_config?: unknown }): BrandColor[] {
  let config = site.feature_config
  if (typeof config === 'string') {
    try { config = JSON.parse(config) } catch { config = null }
  }
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    const palette = parseBrandPalette((config as Record<string, unknown>).brandPalette)
    if (palette) return palette
  }
  const accent = site.accent_color || site.theme_color || '#155e59'
  if (site.profile === 'lifetech' || site.profile === 'baltimore-medtech'
    || ['lifetech', 'baltimore-medtech'].includes(site.slug || site.home_org_slug || '')) return [
    { label: 'HealthTech Teal', value: accent, description: 'Our existing health technology teal.' },
    { label: 'MedTech OffWhite', value: '#F4F5F0', description: 'Inspired by the off-white finish of MRI machines.' },
    { label: 'BioTech Gold', value: '#D4AF37', description: 'Represents the monetary potential of biotechnology.' },
  ]
  return [
    { label: 'Accent', value: accent },
    { label: 'Portal theme', value: site.theme_color || accent },
    { label: 'White', value: '#FFFFFF' },
  ].filter((color, index, list) => list.findIndex(item => item.value.toLowerCase() === color.value.toLowerCase()) === index)
}
