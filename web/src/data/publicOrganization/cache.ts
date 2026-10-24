export const PUBLIC_DATA_REFRESH_MS = 5 * 60 * 1000
export type PublicReportEntry<T> = { url: string; data: T; etag: string | null; checkedAt: number; updatedAt?: number; lastModified?: string | null }
const memory = new Map<string, PublicReportEntry<unknown>>()
function remember(entry: PublicReportEntry<unknown>) {
  memory.delete(entry.url)
  memory.set(entry.url, structuredClone(entry))
  if (memory.size > 128) memory.delete(memory.keys().next().value!)
}
const pending = new Map<string, Promise<PublicReportEntry<unknown>>>()
let storage: IDBFactory | undefined
function syncStorage() {
  const current = typeof indexedDB === 'undefined' ? undefined : indexedDB
  if (storage !== current) { memory.clear(); pending.clear(); storage = current }
}
export const PUBLIC_ORGANIZATION_CACHE_EVENT = 'orgportal-public-organization-cache-updated'
let channel: BroadcastChannel | undefined
function notify(url: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PUBLIC_ORGANIZATION_CACHE_EVENT, { detail: { url } }))
}
function shareUpdates() {
  if (channel || typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return
  try {
    channel = new BroadcastChannel('orgportal-public-organization-data-v1')
    channel.onmessage = event => {
      try {
        if (event.data?.invalidate === true) { memory.clear(); notify(''); return }
        const url = publicReportUrl(event.data?.url)
        memory.delete(url)
        notify(url)
      } catch { /* Ignore messages outside the public cache allowlist. */ }
    }
  } catch { /* IndexedDB remains shared when cross-tab notifications are unavailable. */ }
}
const databaseName = 'orgportal-public-organization-data-v1'

export function publicReportUrl(path: string) {
  const url = new URL(path, location.origin)
  const profile = /^\/api\/org\/api\/network\/orgs\/public\/[^/]+$/.test(url.pathname) && !url.search
  const report = /^\/api\/org\/api\/network\/orgs\/public\/[^/]+\/(support|financing)$/.test(url.pathname) && (!url.search || /^\?offset=\d+$/.test(url.search))
  const snapshot = /^\/(?:p\/)?ecosystem-data\/ecosystem-(portal|history|relationships|nonprofits|performance)\.json$/.test(url.pathname) && !url.search
  const directory = url.pathname === '/api/org/api/network/orgs/public' && /^\?limit=500&offset=\d+$/.test(url.search)
  const peers = /^\/api\/org\/api\/network\/orgs\/public\/[^/]+\/peers$/.test(url.pathname) && /^\?limit=(?:[1-9]\d?|100)&q=[^&]*$/.test(url.search)
  const relationships = url.pathname === '/api/org/api/network/relationships/public' && /^\?offset=\d+$/.test(url.search)
  if (url.origin !== location.origin || url.username || url.password || url.hash || !(profile || report || snapshot || directory || relationships || peers)) {
    throw new Error('Only same-origin public organization data can be cached')
  }
  return url.href
}

async function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null
  return new Promise(resolve => {
    let finished = false
    const finish = (db: IDBDatabase | null) => { if (finished) { db?.close(); return }; finished = true; clearTimeout(timeout); resolve(db) }
    const timeout = setTimeout(() => finish(null), 2000)
    try {
      const request = indexedDB.open(databaseName, 1)
      request.onupgradeneeded = () => request.result.createObjectStore('reports', { keyPath: 'url' })
      request.onsuccess = () => finish(request.result)
      request.onerror = () => finish(null)
      request.onblocked = () => finish(null)
    } catch { finish(null) }
  })
}
export function peekPublicReport<T>(path: string): PublicReportEntry<T> | null {
  const url = publicReportUrl(path)
  syncStorage()
  const entry = memory.get(url)
  return entry ? structuredClone(entry) as PublicReportEntry<T> : null
}

export async function readPublicReport<T>(path: string): Promise<PublicReportEntry<T> | null> {
  const url = publicReportUrl(path)
  syncStorage(); shareUpdates()
  const resident = memory.get(url)
  if (resident) return structuredClone(resident) as PublicReportEntry<T>
  const db = await database()
  if (!db) return null
  try {
    return await new Promise(resolve => {
      const transaction = db.transaction('reports', 'readonly')
      const request = transaction.objectStore('reports').get(url)
      request.onsuccess = () => {
        if (request.result) remember(request.result)
        resolve(request.result || null)
      }
      request.onerror = () => resolve(null)
      transaction.onabort = () => resolve(null)
    })
  } catch { return null }
  finally { db.close() }
}
export async function savePublicReport<T>(entry: PublicReportEntry<T>) {
  publicReportUrl(entry.url)
  syncStorage()
  remember(entry)
  const db = await database()
  if (!db) return
  let committed = false
  try {
    await new Promise<void>(resolve => {
      const transaction = db.transaction('reports', 'readwrite')
      transaction.objectStore('reports').put(entry)
      transaction.oncomplete = () => { committed = true; resolve() }
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    })
  } catch { /* Storage denial or quota exhaustion must not break a live read. */ }
  finally { db.close() }
  shareUpdates(); notify(entry.url)
  try { if (committed) channel?.postMessage({ url: entry.url }) } catch { /* A closed channel must not break reads. */ }
}

/** Mark public responses stale after a confirmed server write, preserving offline copies. */
export async function invalidatePublicOrganizationData() {
  syncStorage()
  for (const entry of memory.values()) entry.checkedAt = 0
  const db = await database()
  if (db) {
    try {
      await new Promise<void>(resolve => {
        const transaction = db.transaction('reports', 'readwrite')
        const cursor = transaction.objectStore('reports').openCursor()
        cursor.onsuccess = () => { const row = cursor.result; if (row) { row.update({ ...row.value, checkedAt: 0 }); row.continue() } }
        transaction.oncomplete = transaction.onerror = transaction.onabort = () => resolve()
      })
    } catch { /* A failed local invalidation cannot undo a successful remote write. */ }
    finally { db.close() }
  }
  shareUpdates(); notify('')
  try { channel?.postMessage({ invalidate: true }) } catch { /* Storage remains usable without notifications. */ }
}

export async function refreshPublicReport<T>(path: string, options: {
  signal?: AbortSignal; force?: boolean; validate: (data: unknown) => T;
  onCached?: (entry: PublicReportEntry<T>) => void;
}): Promise<PublicReportEntry<T> & { fromCache: boolean }> {
  const url = publicReportUrl(path)
  let cached = await readPublicReport<T>(url)
  if (cached) {
    try { cached = { ...cached, data: options.validate(cached.data) } }
    catch { cached = null }
  }
  options.signal?.throwIfAborted()
  if (cached) {
    options.onCached?.(cached)
    if (!options.force && Date.now() - cached.checkedAt < PUBLIC_DATA_REFRESH_MS) return { ...cached, fromCache: true }
  }
  let request = pending.get(url)
  if (!request) {
    // A view's cancellation must not cancel a request shared with another view.
    request = (async () => {
      const headers = new Headers()
      if (cached?.etag) headers.set('If-None-Match', cached.etag)
      else if (cached?.lastModified) headers.set('If-Modified-Since', cached.lastModified)
      const response = await fetch(url, { headers, credentials: 'omit', cache: 'no-cache' })
      let entry: PublicReportEntry<T>
      if (response.status === 304 && cached) entry = { ...cached, checkedAt: Date.now() }
      else {
        if (!response.ok) throw new Error('Update unavailable. Showing the last saved data, if available.')
        entry = { url, data: options.validate(await response.json()), etag: response.headers.get('ETag'), lastModified: response.headers.get('Last-Modified'), updatedAt: Date.now(), checkedAt: Date.now() }
      }
      await savePublicReport(entry)
      return entry
    })()
    pending.set(url, request)
    void request.finally(() => { if (pending.get(url) === request) pending.delete(url) }).catch(() => {})
  }
  const entry = structuredClone(await request) as PublicReportEntry<T>
  options.signal?.throwIfAborted()
  entry.data = options.validate(entry.data)
  return { ...entry, fromCache: false }
}
