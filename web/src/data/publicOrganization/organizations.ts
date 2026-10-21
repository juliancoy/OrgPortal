import { refreshPublicReport } from './cache'

export type PublicOrganizationRecord = { id: string; name: string; slug: string }
export function validatePublicOrganization<T extends PublicOrganizationRecord>(value: unknown): T {
 if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' || !('name' in value) || typeof value.name !== 'string' || !('slug' in value) || typeof value.slug !== 'string') throw new Error('Public organization data is incomplete')
 return value as T
}
export async function loadPublicOrganization<T extends PublicOrganizationRecord>(handle: string, options: {signal?: AbortSignal; force?: boolean} = {}): Promise<T> {
 return (await refreshPublicReport(`/api/org/api/network/orgs/public/${encodeURIComponent(handle)}`, { ...options, validate: validatePublicOrganization<T> })).data
}
export async function loadPublicOrganizationDirectory<T extends PublicOrganizationRecord>(options: {signal?: AbortSignal; force?: boolean} = {}): Promise<T[]> {
 const rows = new Map<string,T>()
 for (let offset = 0; ; offset += 500) {
  const entry = await refreshPublicReport(`/api/org/api/network/orgs/public?limit=500&offset=${offset}`, {
   ...options, validate(value) {
    if (!Array.isArray(value)) throw new Error('Public organization directory is incomplete')
    return value.map(row => validatePublicOrganization<T>(row))
   },
  })
  for (const row of entry.data) rows.set(row.id,row)
  if (entry.data.length < 500) return [...rows.values()]
 }
}
