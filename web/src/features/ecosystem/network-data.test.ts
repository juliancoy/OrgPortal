import { describe, expect, it, vi } from 'vitest'
import { loadSharedNetworkData } from './network-data.js'

describe('shared graph preparation', () => {
  it('reuses preparation across dimensions while isolating mutable renderer data', async () => {
    const load = vi.fn(async () => ({ data: { organizations: [{ id: 'tedco', x: 1 }] } }))
    const signal = new AbortController().signal
    const [two, three] = await Promise.all([
      loadSharedNetworkData('dimensions', load, signal),
      loadSharedNetworkData('dimensions', load, signal),
    ])
    two.data.organizations[0].x = 99
    expect(three.data.organizations[0].x).toBe(1)
    expect(load).toHaveBeenCalledTimes(1)
    const four = await loadSharedNetworkData('dimensions', load, signal)
    expect(four.data.organizations[0].x).toBe(1)
    expect(load).toHaveBeenCalledTimes(1)
  })
  it('retries failed preparation and refreshes after five minutes', async () => {
    const signal = new AbortController().signal
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: {} })
    await expect(loadSharedNetworkData('retry', load, signal)).rejects.toThrow('offline')
    await loadSharedNetworkData('retry', load, signal)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001)
    try { await loadSharedNetworkData('retry', load, signal) }
    finally { clock.mockRestore() }
    expect(load).toHaveBeenCalledTimes(3)
  })
})
