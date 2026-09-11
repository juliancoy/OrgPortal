import type { PortalTenant } from './timebankCommunity'

export type SpecialtyResource = {
  id: string
  label: string
  description: string
  href: string
  category?: string
  external?: boolean
}

const DEFAULT_MEDTECH_RESOURCES: SpecialtyResource[] = [
  {
    id: 'map',
    label: 'MedTech Map',
    description: 'Explore Baltimore health, medicine, biotech, and public-health infrastructure layers.',
    href: '/specialty/baltimore-medtech/map.html',
    category: 'Map',
  },
  {
    id: 'datasets',
    label: 'Data Workbook',
    description: 'Browse the MedTech source-of-sources index, live public datasets, and versioned snapshots.',
    href: '/specialty/baltimore-medtech/datasets.html',
    category: 'Data',
  },
  {
    id: 'taxonomy',
    label: 'Medical Atlas',
    description: 'Navigate the medical science field atlas, coding systems, and Medicaid reference layers.',
    href: '/specialty/baltimore-medtech/taxonomy.html',
    category: 'Atlas',
  },
  {
    id: 'need-availability',
    label: 'Need Gaps',
    description: 'Compare directional medical need against workforce and allied-care availability signals.',
    href: '/specialty/baltimore-medtech/need-availability-distortions.html',
    category: 'Analysis',
  },
]

function cleanResource(value: unknown): SpecialtyResource | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  const label = typeof input.label === 'string' ? input.label.trim() : ''
  const href = typeof input.href === 'string' ? input.href.trim() : ''
  if (!id || !label || !href) return null
  return {
    id,
    label,
    href,
    description: typeof input.description === 'string' ? input.description.trim() : '',
    category: typeof input.category === 'string' ? input.category.trim() : undefined,
    external: input.external === true,
  }
}

export function specialtyResourcesForTenant(tenant?: PortalTenant | null): SpecialtyResource[] {
  if (!tenant) return []
  const configured = Array.isArray(tenant.feature_config?.specialtyResources)
    ? tenant.feature_config.specialtyResources.map(cleanResource).filter((resource): resource is SpecialtyResource => Boolean(resource))
    : []
  if (configured.length) return configured
  if (tenant.profile === 'baltimore-medtech' || tenant.id === 'baltimore-medtech' || tenant.hostname === 'medtech.social') return DEFAULT_MEDTECH_RESOURCES
  return []
}

export function hasTenantCalendar(tenant?: PortalTenant | null) {
  if (!tenant) return false
  if (tenant.features?.includes('calendar')) return true
  return tenant.features?.includes('events') || tenant.profile === 'baltimore-medtech'
}
