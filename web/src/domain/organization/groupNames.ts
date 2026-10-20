const aliases: Record<string, string> = {
  'maryland department of commerce': 'MD Commerce',
  'md department of commerce': 'MD Commerce',
  'md commerce department': 'MD Commerce',
  'maryland commerce department': 'MD Commerce',
  'johns hopkins technology ventures': 'JHTV',
  'university of maryland baltimore': 'UMB',
  'university of maryland baltimore county': 'UMBC',
  'university system of maryland': 'USM',
  'national institutes of health': 'NIH',
  'us economic development administration': 'US EDA',
  'howard county economic development authority': 'Howard County EDA',
  'baltimore development corporation': 'BDC',
}
const normalize = (name: string) => name.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()
const limit = 28

/** Compact display aliases only; never use these to identify or merge groups. */
export function shortGroupName(name: string): string {
  const full = name.replace(/\s+/g, ' ').trim()
  const key = normalize(full)
  const alias = Object.hasOwn(aliases, key) ? aliases[key] : undefined
  if (alias) return alias
  if (full.length <= limit) return full
  // Use an acronym supplied in the name, rather than inventing one.
  const acronym = full.match(/\(([A-Z][A-Z0-9&.-]{1,11})\)$/)?.[1]
  if (acronym && !/\band\b|\s&\s|\//i.test(full.replace(/\([^)]*\)/g, ''))) return acronym
  let short = full.replace(/^The\s+/i, '')
    .replace(/\bLeague of Women Voters\b/gi, 'LWV')
    .replace(/\bMaryland\b/gi, 'MD')
    .replace(/\bDepartment\s+of\s+/gi, '')
    .replace(/\bDepartment\b/gi, 'Dept')
    .replace(/\bEconomic Development\b/gi, 'Econ Dev')
    .replace(/\bDevelopment\b/gi, 'Dev')
    .replace(/\bAdministration\b/gi, 'Admin')
    .replace(/\bAssociation\b/gi, 'Assoc')
    .replace(/\bCorporation\b/gi, 'Corp')
    .replace(/\bFoundation\b/gi, 'Fdn')
    .replace(/\bUniversity\b/gi, 'Univ')
    .replace(/\bTechnology\b/gi, 'Tech')
    .replace(/\bInnovation\b/gi, 'Innov')
    .replace(/\bInternational\b/gi, 'Intl')
    .replace(/\bCenter\b/gi, 'Ctr')
    .replace(/\band\b/gi, '&')
    .replace(/,?\s+(?:Inc\.?|LLC|Ltd\.?)$/i, '')
  if (short.length <= limit) return short
  const prefix = short.slice(0, limit - 1)
  const space = prefix.lastIndexOf(' ')
  short = space > limit / 2 ? prefix.slice(0, space) : prefix
  return short.replace(/[\s,;:/&—–-]+$/, '') + '…'
}
