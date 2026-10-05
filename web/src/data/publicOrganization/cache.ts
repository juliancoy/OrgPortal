export const PUBLIC_DATA_REFRESH_MS = 5 * 60 * 1000
export type PublicReportEntry<T> = { url: string; data: T; etag: string | null; checkedAt: number }
const databaseName = 'orgportal-public-organization-data-v1'

export function publicReportUrl(path: string) {
  const url = new URL(path, location.origin)
  if (url.origin !== location.origin || url.username || url.password || url.search || url.hash ||
    !/^\/api\/org\/api\/network\/orgs\/public\/[^/]+\/(support|financing)$/.test(url.pathname)) {
    throw new Error('Only same-origin public organization reports can be cached')
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
export async function readPublicReport<T>(path: string): Promise<PublicReportEntry<T> | null> {
  const url = publicReportUrl(path), db = await database()
  if (!db) return null
  try {
    return await new Promise(resolve => {
      const transaction = db.transaction('reports', 'readonly')
      const request = transaction.objectStore('reports').get(url)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => resolve(null)
      transaction.onabort = () => resolve(null)
    })
  } catch { return null }
  finally { db.close() }
}
export async function savePublicReport<T>(entry: PublicReportEntry<T>) {
  publicReportUrl(entry.url)
  const db = await database()
  if (!db) return
  try {
    await new Promise<void>(resolve => {
      const transaction = db.transaction('reports', 'readwrite')
      transaction.objectStore('reports').put(entry)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    })
  } catch { /* Storage denial or quota exhaustion must not break a live read. */ }
  finally { db.close() }
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
  const headers = new Headers()
  if (cached?.etag) headers.set('If-None-Match', cached.etag)
  // Public reads never carry a session, OAuth token or permission context.
  const response = await fetch(url, { signal: options.signal, headers, credentials: 'omit', cache: 'no-cache' })
  let entry: PublicReportEntry<T>
  if (response.status === 304 && cached) entry = { ...cached, checkedAt: Date.now() }
  else {
    if (!response.ok) throw new Error('Update unavailable. Showing the last saved data, if available.')
    entry = { url, data: options.validate(await response.json()), etag: response.headers.get('ETag'), checkedAt: Date.now() }
  }
  options.signal?.throwIfAborted()
  await savePublicReport(entry)
  return { ...entry, fromCache: false }
}
