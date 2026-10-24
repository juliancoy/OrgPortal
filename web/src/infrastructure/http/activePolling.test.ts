import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startActivePolling } from './activePolling'

describe('active polling', () => {
  let page: EventTarget & { visibilityState: string }
  let network: { onLine: boolean }
  let browser: EventTarget
  let stop: (() => void) | undefined
  beforeEach(() => {
    vi.useFakeTimers()
    page = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    browser = new EventTarget()
    network = { onLine: true }
    vi.stubGlobal('document', page)
    vi.stubGlobal('window', browser)
    vi.stubGlobal('navigator', network)
  })
  afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })
  it('refreshes initially and once a minute, and removes listeners on cleanup', async () => {
    const refresh = vi.fn(async () => {})
    stop = startActivePolling(refresh)
    await vi.advanceTimersByTimeAsync(59_999)
    expect(refresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(refresh).toHaveBeenCalledTimes(2)
    stop()
    browser.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
  it('does no work while hidden or offline, and refreshes on return', async () => {
    page.visibilityState = 'hidden'
    const refresh = vi.fn(async () => {})
    stop = startActivePolling(refresh)
    await vi.advanceTimersByTimeAsync(180_000)
    expect(refresh).not.toHaveBeenCalled()
    page.visibilityState = 'visible'
    page.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(refresh).toHaveBeenCalledTimes(1)
    network.onLine = false
    browser.dispatchEvent(new Event('offline'))
    await vi.advanceTimersByTimeAsync(180_000)
    browser.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(1)
    network.onLine = true
    browser.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
  it('coalesces focus events and does not overlap slow requests', async () => {
    let finish!: () => void
    const refresh = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    stop = startActivePolling(refresh)
    for (let i = 0; i < 5; i++) browser.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
  it('throttles repeated focus and aborts work when hidden or disposed', async () => {
    const refresh = vi.fn(async (_signal: AbortSignal) => {})
    stop = startActivePolling(refresh)
    await vi.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 5; i++) browser.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(9_999)
    expect(refresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(refresh).toHaveBeenCalledTimes(2)
    let signal!: AbortSignal
    stop()
    stop = startActivePolling(s => { signal = s; return new Promise(() => {}) })
    page.visibilityState = 'hidden'
    page.dispatchEvent(new Event('visibilitychange'))
    expect(signal.aborted).toBe(true)
    stop()
    page.visibilityState = 'visible'
    page.dispatchEvent(new Event('visibilitychange'))
    expect(vi.getTimerCount()).toBe(0)
  })
})
