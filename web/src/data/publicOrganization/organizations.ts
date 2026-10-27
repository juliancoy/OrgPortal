import { peekPublicReport, refreshPublicReport } from './cache'

export type PublicOrganizationRecord = { id: string; name: string; slug: string }
export function validatePublicOrganization<T extends PublicOrganizationRecord>(value: unknown): T {
 if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' || !('name' in value) || typeof value.name !== 'string' || !('slug' in value) || typeof value.slug !== 'string') throw new Error('Public organization data is incomplete')
 return value as T
}
export async function loadPublicOrganization<T extends PublicOrganizationRecord>(handle: string, options: {signal?: AbortSignal; force?: boolean} = {}): Promise<T> {
 return (await refreshPublicReport(`/api/org/api/network/orgs/public/${encodeURIComponent(handle)}`, { ...options, validate: validatePublicOrganization<T> })).data
}
export async function loadPublicOrganizationDirectory<T extends PublicOrganizationRecord>(options: {signal?: AbortSignal; force?: boolean; onPage?: (rows: T[]) => void} = {}): Promise<T[]> {
 const rows = new Map<string,T>()
 for (let offset = 0; ; offset += 500) {
  const entry = await refreshPublicReport<T[]>(`/api/org/api/network/orgs/public?limit=500&offset=${offset}`, {
   ...options,
   onCached(entry) {
    options.signal?.throwIfAborted()
    const preview = new Map(rows)
    for (const row of entry.data) preview.set(row.id,row)
    options.onPage?.(structuredClone([...preview.values()]))
   },
   validate(value) {
    if (!Array.isArray(value)) throw new Error('Public organization directory is incomplete')
    return value.map(row => validatePublicOrganization<T>(row))
   },
  })
  for (const row of entry.data) rows.set(row.id,row)
  options.signal?.throwIfAborted()
  options.onPage?.(structuredClone([...rows.values()]))
  if (entry.data.length < 500) return [...rows.values()]
 }
}

export function peekPublicOrganizationDirectory<T extends PublicOrganizationRecord>(): T[] | null {
 const rows = new Map<string, T>()
 for (let offset = 0; ; offset += 500) {
  const entry = peekPublicReport<T[]>(`/api/org/api/network/orgs/public?limit=500&offset=${offset}`)
  if (!entry || !Array.isArray(entry.data)) return null
  try { for (const row of entry.data) { const valid = validatePublicOrganization<T>(row); rows.set(valid.id, valid) } }
  catch { return null }
  if (entry.data.length < 500) return [...rows.values()]
 }
}
