import { useEffect, useLayoutEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { readFormDraft, writeFormDraft } from './localFormDraft'
import '../components/local-form-draft.css'

export function useLocalFormDraft<T extends object>(key: string | null, initial: T) {
  function load() {
    if (!key || typeof window === 'undefined') return initial
    try { return readFormDraft(window.localStorage, key, initial) } catch { return initial }
  }
  const [state, setState] = useState(() => ({ key, value: load() }))
  const [saved, setSaved] = useState<{ key: string; snapshot: string } | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const value = state.key === key ? state.value : initial
  const snapshot = JSON.stringify(value)
  useEffect(() => {
    setState(previous => previous.key === key ? previous : { key, value: load() })
    setSaved(null); setUnavailable(false)
    // initial is a module-level form schema; drafts are isolated by account and resource.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useLayoutEffect(() => {
    if (!key || state.key !== key) return
    // Persist each committed edit before navigation or reload can discard it.
    {
      try {
        if (snapshot === JSON.stringify(initial)) {
          window.localStorage.removeItem(key); setSaved(null); return
        }
        const ok = writeFormDraft(window.localStorage, key, value)
        setSaved(ok ? { key, snapshot } : null); setUnavailable(!ok)
      } catch { setSaved(null); setUnavailable(true) }
    }
  }, [key, state.key, value, snapshot, initial])
  useEffect(() => {
    if (!key) return
    const check = () => {
      try {
        const raw = window.localStorage.getItem(key)
        const stored = raw ? readFormDraft(window.localStorage, key, initial) : null
        setSaved(stored && raw && JSON.stringify(JSON.parse(raw).value) === JSON.stringify(stored) && window.localStorage.getItem(key)
          ? { key, snapshot: JSON.stringify(stored) } : null)
      } catch { setSaved(null); setUnavailable(true) }
    }
    window.addEventListener('storage', check); window.addEventListener('focus', check)
    return () => { window.removeEventListener('storage', check); window.removeEventListener('focus', check) }
  }, [key, initial])
  const setValue: Dispatch<SetStateAction<T>> = change => setState(previous => {
    const current = previous.key === key ? previous.value : load()
    return { key, value: typeof change === 'function' ? (change as (previous: T) => T)(current) : change }
  })
  function clear() {
    if (key) try { window.localStorage.removeItem(key) } catch { /* Still clear the current form. */ }
    setState({ key, value: initial }); setSaved(null)
  }
  return { value, setValue, clear, saved: !!key && saved?.key === key && saved.snapshot === snapshot, unavailable }
}
