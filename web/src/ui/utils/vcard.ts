export type VCardLink = {
  label: string
  url: string
}

export type VCardContact = {
  user_name: string
  headline?: string | null
  bio?: string | null
  photo_url?: string | null
  email_public?: string | null
  phone_public?: string | null
  website_url?: string | null
  linkedin_url?: string | null
  github_url?: string | null
  x_url?: string | null
  links?: VCardLink[]
}

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .trim()
}

function cleanUrl(value?: string | null): string | null {
  const trimmed = String(value || '').trim()
  return trimmed || null
}

function addUrl(lines: string[], url: string | null | undefined, label: string, index: number): number {
  const cleaned = cleanUrl(url)
  if (!cleaned) return index
  lines.push(`item${index}.URL:${escapeValue(cleaned)}`)
  lines.push(`item${index}.X-ABLabel:${escapeValue(label)}`)
  return index + 1
}

export function createVCard(contact: VCardContact, publicUrl?: string | null): string {
  const fullName = String(contact.user_name || 'Contact').trim() || 'Contact'
  const lines = [
    'BEGIN:VCARD',
    'VERSION:4.0',
    `FN:${escapeValue(fullName)}`,
    `N:${escapeValue(fullName)};;;;`,
  ]

  if (contact.headline?.trim()) lines.push(`TITLE:${escapeValue(contact.headline)}`)
  if (contact.bio?.trim()) lines.push(`NOTE:${escapeValue(contact.bio)}`)
  if (contact.email_public?.trim()) lines.push(`EMAIL;TYPE=internet:${escapeValue(contact.email_public)}`)
  if (contact.phone_public?.trim()) lines.push(`TEL;TYPE=cell:${escapeValue(contact.phone_public)}`)
  if (contact.photo_url?.trim()) lines.push(`PHOTO;VALUE=URI:${escapeValue(contact.photo_url)}`)

  let itemIndex = 1
  itemIndex = addUrl(lines, publicUrl, 'Code Collective ID', itemIndex)
  itemIndex = addUrl(lines, contact.website_url, 'Website', itemIndex)
  itemIndex = addUrl(lines, contact.linkedin_url, 'LinkedIn', itemIndex)
  itemIndex = addUrl(lines, contact.github_url, 'GitHub', itemIndex)
  itemIndex = addUrl(lines, contact.x_url, 'X', itemIndex)
  for (const link of contact.links || []) {
    itemIndex = addUrl(lines, link.url, link.label || 'Link', itemIndex)
  }

  lines.push('END:VCARD')
  return `${lines.join('\r\n')}\r\n`
}

export function vCardFileName(name: string, fallback = 'contact'): string {
  const slug = String(name || fallback)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${slug || fallback}.vcf`
}
