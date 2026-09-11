import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../app/AppProviders'
import { fetchTimebank } from '../../timebank/useTimebankApi'

export type ImportedListing = { id: string; title: string; kind: 'offer' | 'request'; description: string; owner_name: string; image_id: string | null; captured_at: string; source_name: string; source_url: string; claimed_user_id: string | null; claimed_user_name: string | null; claimed_by_me: number }
export function ImportedPhoto({ item, large = false }: { item: ImportedListing; large?: boolean }) {
  const { token } = useAuth()
  const ref = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!item.image_id || !ref.current) return
    const abort = new AbortController()
    let objectUrl = ''
    setUrl('')
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      void fetchTimebank(`/imports/listings/${item.id}/image`, token, { signal: abort.signal })
        .then((response) => response.blob()).then((blob) => {
          if (!abort.signal.aborted) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) }
        }).catch(() => {})
    }, { rootMargin: '150px' })
    observer.observe(ref.current)
    return () => { observer.disconnect(); abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [item.id, item.image_id, token])
  return <div ref={ref} className={large ? 'tb-imported-photo-frame' : undefined}>{url ? <img className={`tb-listing-photo ${large ? 'tb-photo-large' : ''}`} src={url} alt={item.title} /> : <div className={`tb-photo-placeholder ${large ? 'tb-photo-large' : ''}`} aria-hidden="true"><span>↔</span></div>}</div>
}
