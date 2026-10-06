import { useEffect, useRef, useState } from 'react'
import { PUBLIC_DATA_REFRESH_MS, refreshPublicReport } from './cache'
const refreshEvent = 'orgportal-refresh-public-organization-data'
export function updatePublicOrganizationData() { window.dispatchEvent(new Event(refreshEvent)) }
export function usePublicOrganizationReport<T>(url: string, validate: (data: unknown) => T, onData: (data: T) => void, revision = 0) {
  const callbacks = useRef({ validate, onData }); callbacks.current = { validate, onData }
  const [status, setStatus] = useState({ checkedAt: 0, cached: false, refreshing: false, error: '' })
  useEffect(() => {
    let controller: AbortController | null = null
    let active = true
    let pendingForce = false
    setStatus({ checkedAt: 0, cached: false, refreshing: false, error: '' })
    const load = async (force = false) => {
      if (controller) { pendingForce ||= force; return }
      controller = new AbortController()
      setStatus(current => ({ ...current, refreshing: true, error: '' }))
      try {
        const entry = await refreshPublicReport(url, {
          signal: controller.signal, force, validate: data => callbacks.current.validate(data),
          onCached: entry => {
            if (!active) return
            callbacks.current.onData(entry.data)
            setStatus(current => ({ ...current, checkedAt: entry.checkedAt, cached: true }))
          },
        })
        if (active) {
          callbacks.current.onData(entry.data)
          setStatus({ checkedAt: entry.checkedAt, cached: entry.fromCache, refreshing: false, error: '' })
        }
      } catch {
        if (active) setStatus(current => ({ ...current, refreshing: false, error: 'Update unavailable. Showing the last saved data, if available.' }))
      } finally { controller = null; if (active && pendingForce) { pendingForce = false; void load(true) } }
    }
    const manual = () => { void load(true) }
    const resume = () => { if (document.visibilityState === 'visible') void load() }
    void load(revision > 0)
    const timer = window.setInterval(resume, PUBLIC_DATA_REFRESH_MS)
    window.addEventListener(refreshEvent, manual)
    window.addEventListener('online', manual)
    document.addEventListener('visibilitychange', resume)
    return () => {
      active = false; controller?.abort(); window.clearInterval(timer)
      window.removeEventListener(refreshEvent, manual); window.removeEventListener('online', manual)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [url, revision])
  return status
}
