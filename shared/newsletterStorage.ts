/** Version contract shared by the D1/SQLite backend and browser IndexedDB. */
export const NEWSLETTER_STORAGE = { protocol: 1, indexedDb: 2, sqlMigration: '0071_newsletter_source_archives.sql', remoteSqlMigration: '0072_private_newsletter_sync.sql' } as const

export type NewsletterDocument = {
  schemaVersion: 1
  source: Record<string, unknown> & { publisher: string; senderEmail: string; subject: string; publishedDate: string }
  items: Array<Record<string, unknown> & { key: string; title: string; kind: string }>
}

export function validateNewsletter(value: unknown): NewsletterDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid newsletter')
  const doc = value as NewsletterDocument
  if (doc.schemaVersion !== 1 || !doc.source || typeof doc.source !== 'object' || Array.isArray(doc.source) ||
    !['publisher', 'senderEmail', 'subject', 'publishedDate'].every(k => typeof doc.source[k] === 'string' && String(doc.source[k]).length > 0) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(doc.source.publishedDate) || !Array.isArray(doc.items) || doc.items.length > 250 ||
    doc.items.some(item => !item || typeof item !== 'object' || Array.isArray(item) || !['key', 'title', 'kind'].every(k => typeof item[k] === 'string' && String(item[k]).length > 0)) ||
    new Set(doc.items.map(item => item.key)).size !== doc.items.length || JSON.stringify(doc).length > 90000) throw Error('Invalid newsletter content or size')
  // Only the source and factual items are imported, never execution flags or credentials.
  return { schemaVersion: 1, source: doc.source, items: doc.items }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k])).join(',') + '}'
  return JSON.stringify(value)
}
export async function contentHash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)))
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
}
export async function newsletterId(doc: NewsletterDocument): Promise<string> {
  // The issue identity stays stable when a message gains missing links or corrections.
  return 'newsletter-' + await contentHash([doc.source.senderEmail.toLowerCase(), doc.source.publishedDate, doc.source.subject])
}
