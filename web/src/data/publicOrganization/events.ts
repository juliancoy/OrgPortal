/** Public-only, bounded memory cache: no credentials, attendance or durable storage. */
const entries = new Map<string, {expires: number; rows: unknown[]}>()
const pending = new Map<string, Promise<unknown[]>>()
const TTL = 60_000
const MAX_ENTRIES = 20
function feedUrl(path: string) {
 const url = new URL(path, location.origin)
 const allowed = url.pathname === '/api/org/api/network/events/public' || /^\/api\/org\/api\/network\/orgs\/public\/[^/]+\/events$/.test(url.pathname)
 if (url.origin !== location.origin || !allowed || url.hash || url.username || url.password || [...url.searchParams.keys()].some(key => !['limit','offset','q','upcoming_only'].includes(key))) throw new Error('Only public event feeds can be shared')
 url.searchParams.sort()
 return url.href
}
function validate(value: unknown): unknown[] {
 if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || typeof row.id !== 'string')) throw new Error('The event listing is unavailable.')
 return value
}
function waitFor<T>(request: Promise<T>, signal?: AbortSignal): Promise<T> {
 if (!signal) return request
 signal.throwIfAborted()
 return new Promise((resolve,reject) => {
  const abort = () => reject(signal.reason)
  signal.addEventListener('abort',abort,{once:true})
  request.then(resolve,reject).finally(() => signal.removeEventListener('abort',abort))
 })
}
export async function loadPublicEventFeed<T extends {id: string}>(path: string, signal?: AbortSignal): Promise<T[]> {
 const url = feedUrl(path)
 signal?.throwIfAborted()
 const now = Date.now()
 for (const [key,entry] of entries) if (entry.expires <= now) entries.delete(key)
 const cached = entries.get(url)
 if (cached) { entries.delete(url); entries.set(url,cached); return structuredClone(cached.rows) as T[] }
 let request = pending.get(url)
 if (!request) {
  request = (async () => {
   const response = await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(15_000)})
   if (!response.ok) { const detail = await response.text().catch(() => ''); throw new Error(detail.slice(0,2000) || `Failed to load events (${response.status})`) }
   const rows = validate(await response.json())
   entries.set(url,{expires:Date.now()+TTL,rows:structuredClone(rows)})
   while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!)
   return rows
  })()
  pending.set(url,request)
  void request.finally(() => { if (pending.get(url) === request) pending.delete(url) }).catch(() => {})
 }
 return structuredClone(await waitFor(request,signal)) as T[]
}
