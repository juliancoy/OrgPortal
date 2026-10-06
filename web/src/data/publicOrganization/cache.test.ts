import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { publicReportUrl, readPublicReport, refreshPublicReport, PUBLIC_DATA_REFRESH_MS } from './cache'
const path = '/api/org/api/network/orgs/public/tedco/financing'
const validate = (value: unknown) => {
  if (!value || typeof value !== 'object' || !('recipients' in value)) throw new Error('Invalid data')
  return value as { recipients: number }
}
beforeEach(() => {
  vi.unstubAllGlobals(); vi.restoreAllMocks()
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('location', { origin: 'https://lifetech.fyi' })
})
describe('public organization IndexedDB cache', () => {
  it('persists validated remote data, reuses fresh records and supports forced conditional refresh', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ recipients: 578 }), { headers: { ETag: '"v1"' } })).mockResolvedValueOnce(new Response(null, { status: 304 }))
    vi.stubGlobal('fetch', fetcher)
    expect((await refreshPublicReport(path, { validate })).fromCache).toBe(false)
    expect((await readPublicReport<{ recipients: number }>(path))?.data.recipients).toBe(578)
    expect((await refreshPublicReport(path, { validate })).fromCache).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const updated = await refreshPublicReport(path, { validate, force: true })
    expect(updated.data.recipients).toBe(578); expect(updated.fromCache).toBe(false)
    expect(fetcher.mock.calls[1][1].headers.get('If-None-Match')).toBe('"v1"')
    expect(fetcher.mock.calls[0][1].credentials).toBe('omit')
  })
  it('retains the last good state offline and rejects malformed replacements', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ recipients: 578 }))).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Response('{}')))
    await refreshPublicReport(path, { validate })
    const onCached = vi.fn()
    await expect(refreshPublicReport(path, { validate, force: true, onCached })).rejects.toThrow('offline')
    expect(onCached.mock.calls[0][0].data.recipients).toBe(578)
    await expect(refreshPublicReport(path, { validate, force: true })).rejects.toThrow('Invalid data')
    expect((await readPublicReport<{ recipients: number }>(path))?.data.recipients).toBe(578)
  })
  it('revalidates expired data, isolates origins and excludes authenticated endpoints', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ recipients: 578 })))
    vi.stubGlobal('fetch', fetcher)
    const original = await refreshPublicReport(path, { validate })
    vi.spyOn(Date, 'now').mockReturnValue(original.checkedAt + PUBLIC_DATA_REFRESH_MS + 1)
    fetcher.mockResolvedValue(new Response(JSON.stringify({ recipients: 579 })))
    expect((await refreshPublicReport(path, { validate })).data.recipients).toBe(579)
    vi.stubGlobal('location', { origin: 'https://medtech.social' })
    expect(await readPublicReport(path)).toBeNull()
    for (const unsafe of ['/api/org/api/network/orgs/tedco/admin-view', path + '?token=secret', 'https://lifetech.fyi' + path]) expect(() => publicReportUrl(unsafe)).toThrow()
  })
  it('continues live reads when browser storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ recipients: 578 }))))
    expect((await refreshPublicReport(path, { validate })).data.recipients).toBe(578)
  })
})
