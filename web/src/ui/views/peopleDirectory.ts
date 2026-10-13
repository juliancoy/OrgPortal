import { uniqueAccounts } from '../components/organizationMemberSearch'

const ORG_API_BASE = '/api/org'

export type NetworkUser = {
  user_id: string
  user_name: string
  email?: string | null
  created_at?: string | null
  updated_at?: string | null
  slug?: string | null
  enabled?: boolean
  contact_slug?: string | null
  contact_enabled?: boolean
  headline?: string | null
  photo_url?: string | null
  connection_status?: 'self' | 'none' | 'pending_sent' | 'pending_received' | 'connected' | 'declined'
}

// Shared with organization cards; the People page fetches people only.
export type PublicOrganization = {
  id: string
  name: string
  slug: string
  description?: string | null
  image_url?: string | null
  tags?: string[]
  membership_count?: number
  upcoming_events_count?: number
  feedback_count?: number
  feedback_positive_count?: number
  feedback_concern_count?: number
}

type DirectoryRequest = {
  token: string | null
  query: string
  signal: AbortSignal
  fetcher?: typeof fetch
}

export type DirectoryResult = {
  users: NetworkUser[]
  status: string
}

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

async function fetchRows<T>(fetcher: typeof fetch, url: string, options: RequestInit): Promise<T[]> {
  const response = await fetcher(url, options)
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  const data: unknown = await response.json()
  if (!Array.isArray(data)) throw new Error('Expected an array response')
  return data as T[]
}

export async function loadPeopleDirectory({
  token,
  query,
  signal,
  fetcher = fetch,
}: DirectoryRequest): Promise<DirectoryResult> {
  const params = new URLSearchParams({
    limit: '40',
    sort: 'recent',
  })
  if (query.trim()) params.set('q', query.trim())

  const userPath = token ? '/api/network/users' : '/api/network/users/public'
  const userOptions: RequestInit = token
    ? { headers: { Authorization: `Bearer ${token}` }, signal }
    : { signal }

  try {
    const users = uniqueAccounts(await fetchRows<NetworkUser>(fetcher, orgUrl(`${userPath}?${params.toString()}`), userOptions))
    return { users, status: '' }
  } catch (error) {
    if (signal.aborted) throw error
    return { users: [], status: 'People are temporarily unavailable.' }
  }
}
