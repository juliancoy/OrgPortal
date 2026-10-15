export function installChunkRecovery(target: Window, build: string) {
  const recover = (event: Event) => {
    const key = `portal-chunk-recovery:${build}:${target.location.pathname}`
    try {
      if (target.sessionStorage.getItem(key)) return
      target.sessionStorage.setItem(key, '1')
    } catch {
      // Without a persistent guard, show the route error rather than risk a loop.
      return
    }
    event.preventDefault()
    target.location.reload()
  }
  target.addEventListener('vite:preloadError', recover)
  return () => target.removeEventListener('vite:preloadError', recover)
}
