import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDeploymentStatus, selectDeployment } from './deployment'

afterEach(() => vi.unstubAllGlobals())
describe('deployment selection', () => {
  it('validates server status and hides selection on hosts without support', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ mode: 'development', available: true })))
    expect(await getDeploymentStatus()).toEqual({ mode: 'development', available: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ mode: 'unexpected', available: true })))
    expect(await getDeploymentStatus()).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 404 })))
    expect(await getDeploymentStatus()).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await getDeploymentStatus()).toBeNull()
  })
  it('reloads the exact current URL only after the selection is saved', async () => {
    const reload = vi.fn()
    const location = { href: 'https://lifetech.fyi/profile?view=public#contact', reload }
    vi.stubGlobal('window', { location })
    const fetch = vi.fn().mockResolvedValue(Response.json({ mode: 'development', available: true }))
    vi.stubGlobal('fetch', fetch)
    await selectDeployment('development')
    expect(fetch).toHaveBeenCalledWith('/__portal/deployment', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{"mode":"development"}' })
    expect(location.href).toBe('https://lifetech.fyi/profile?view=public#contact')
    expect(reload).toHaveBeenCalledOnce()
  })
  it('keeps the deployed app open and reports a failed selection', async () => {
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })))
    await expect(selectDeployment('development')).rejects.toThrow('Could not switch app versions')
    expect(reload).not.toHaveBeenCalled()
  })
})
