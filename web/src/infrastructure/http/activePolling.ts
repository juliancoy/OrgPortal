/** Poll only while the page is visible and online. One request at a time. */
export function startActivePolling(refresh: (signal: AbortSignal) => Promise<void>, intervalMs = 60_000) {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: AbortController | undefined
  let lastStarted = -Infinity
  let wakePending = false
  const active = () => document.visibilityState === 'visible' && navigator.onLine
  const schedule = (delay: number) => {
    clearTimeout(timer)
    if (!stopped && active()) timer = setTimeout(() => { void tick() }, delay)
  }
  async function tick() {
    if (stopped || !active()) return
    if (running) { wakePending = true; return }
    const wait = 10_000 - (Date.now() - lastStarted)
    if (wait > 0) { schedule(wait); return }
    clearTimeout(timer)
    const controller = new AbortController()
    running = controller
    lastStarted = Date.now()
    try { await refresh(controller.signal) } catch { /* The caller owns error presentation. */ }
    finally {
      running = undefined
      const delay = wakePending ? Math.max(0, 10_000 - (Date.now() - lastStarted)) : intervalMs
      wakePending = false
      schedule(delay)
    }
  }
  function wake() {
    clearTimeout(timer)
    if (!active()) { running?.abort(); return }
    void tick()
  }
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('focus', wake)
  window.addEventListener('online', wake)
  window.addEventListener('offline', wake)
  void tick()
  return () => {
    stopped = true
    clearTimeout(timer)
    running?.abort()
    document.removeEventListener('visibilitychange', wake)
    window.removeEventListener('focus', wake)
    window.removeEventListener('online', wake)
    window.removeEventListener('offline', wake)
  }
}
