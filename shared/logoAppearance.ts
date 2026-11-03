export type LogoAppearance = {
  background: 'transparent' | 'solid' | 'gradient'
  color: string
  secondaryColor: string
  shape: 'circle' | 'rounded'
}
export const transparentLogoAppearance: LogoAppearance = { background: 'transparent', color: '#F7F5EF', secondaryColor: '#E8E5DD', shape: 'circle' }
export function validLogoAppearance(value: unknown): value is LogoAppearance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const logo = value as LogoAppearance
  return ['transparent', 'solid', 'gradient'].includes(logo.background) && ['circle', 'rounded'].includes(logo.shape)
    && /^#[0-9a-f]{6}$/i.test(logo.color) && /^#[0-9a-f]{6}$/i.test(logo.secondaryColor)
    && Object.keys(value).every(key => ['background', 'color', 'secondaryColor', 'shape'].includes(key))
}
export function defaultLogoAppearance(slug?: string | null): LogoAppearance {
  return { ...transparentLogoAppearance, ...(slug === 'formedinsight' ? { background: 'solid' as const } : {}) }
}
export function logoAppearanceVariables(logo: LogoAppearance): Record<string, string> {
  return {
    '--logo-background': logo.background === 'gradient' ? `linear-gradient(135deg, ${logo.color}, ${logo.secondaryColor})` : logo.background === 'solid' ? logo.color : 'transparent',
    '--logo-radius': logo.shape === 'circle' ? '50%' : '12%',
    '--logo-padding-scale': logo.shape === 'circle' ? '1' : '0.4',
  }
}
