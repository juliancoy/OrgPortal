import { useEffect, type RefObject } from 'react'

export function useNetworkViewport(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const host = root.current
    if (!host) return
    document.documentElement.classList.add('eco-map-open')
    window.scrollTo(0, 0)
    const header = document.querySelector('.portal-header, .tb-shell-header')
    const measure = () => host.style.setProperty('--eco-header-height', `${Math.max(0, header?.getBoundingClientRect().bottom || 0)}px`)
    measure()
    const observer = new ResizeObserver(measure)
    if (header) observer.observe(header)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      document.documentElement.classList.remove('eco-map-open')
    }
  }, [root])
}
