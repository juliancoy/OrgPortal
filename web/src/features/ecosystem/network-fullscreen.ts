/** Share fullscreen behavior across canvas, WebGPU, spatial, and evidence views. */
export function mountNetworkFullscreen(host: HTMLElement) {
  let expanded = false
  let pending = false
  let disposed = false
  let previousFocus: HTMLElement | null = null
  const buttonSelector = '[data-eco-fullscreen]'
  const fullscreenButton = document.createElement('button')
  fullscreenButton.type = 'button'
  fullscreenButton.dataset.ecoFullscreen = ''
  fullscreenButton.className = 'eco-canvas-fullscreen'
  const active = () => expanded || document.fullscreenElement === host

  const sync = () => {
    const fullscreen = active()
    host.classList.toggle('eco-fullscreen', fullscreen)
    const canvasArea = host.querySelector('#network-canvas, .eco-practice-view') || host
    if (fullscreenButton.parentElement !== canvasArea) canvasArea.append(fullscreenButton)
    host.querySelectorAll<HTMLButtonElement>(buttonSelector).forEach(button => {
      const label = fullscreen ? 'Exit fullscreen' : 'Fullscreen'
      if (button.textContent) button.textContent = ''
      button.setAttribute('aria-label', label)
      button.setAttribute('aria-pressed', String(fullscreen))
      button.title = fullscreen ? 'Exit fullscreen (Esc)' : 'Expand map to fullscreen'
    })
  }
  const restoreFocus = () => {
    const target = previousFocus?.isConnected ? previousFocus : host.querySelector<HTMLButtonElement>(buttonSelector)
    target?.focus({ preventScroll: true })
  }
  const toggle = async () => {
    if (pending) return
    pending = true
    try {
      if (document.fullscreenElement === host) {
        await document.exitFullscreen()
        restoreFocus()
      } else if (expanded) {
        expanded = false
        restoreFocus()
      } else {
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
        try {
          if (!host.requestFullscreen || !document.fullscreenEnabled) throw new Error('Fullscreen unavailable')
          // Call directly from the click handler to retain browser user activation.
          await host.requestFullscreen()
          if (disposed && document.fullscreenElement === host) await document.exitFullscreen()
        } catch {
          // Mobile browsers and embedded contexts may disallow the native API.
          // Still offer an edge-to-edge workspace with the same exit control.
          if (!disposed) expanded = true
        }
      }
    } finally {
      pending = false
      if (!disposed) sync()
    }
  }
  const click = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest(buttonSelector)) void toggle()
  }
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      expanded = false
      sync()
      restoreFocus()
    }
  }
  host.addEventListener('click', click)
  document.addEventListener('fullscreenchange', sync)
  document.addEventListener('keydown', keydown)
  // Raw graph markup is replaced when switching spatial representations. Watch
  // only the host's children, not the labels updated on every animation frame.
  const observer = new MutationObserver(sync)
  observer.observe(host, { childList: true })
  sync()
  return () => {
    disposed = true
    observer.disconnect()
    host.removeEventListener('click', click)
    document.removeEventListener('fullscreenchange', sync)
    document.removeEventListener('keydown', keydown)
    fullscreenButton.remove()
    host.classList.remove('eco-fullscreen')
    if (document.fullscreenElement === host) void document.exitFullscreen().catch(() => {})
  }
}
