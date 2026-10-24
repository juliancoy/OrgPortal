import { useCallback, useState, type ImgHTMLAttributes } from 'react'
import './CmsImage.css'

type CmsImageProps = ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }

/** Native lazy loading keeps offscreen CMS media off slow connections. */
export function CmsImage({ priority = false, loading, decoding = 'async', fetchPriority,
  onLoad, onError, className, src, ...props }: CmsImageProps) {
  const [settled, setSettled] = useState<{ src: string | undefined; failed: boolean }>()
  const imageRef = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth > 0) setSettled({ src, failed: false })
  }, [src])
  const state = settled && settled.src === src ? (settled.failed ? 'error' : 'loaded') : 'loading'
  return <img {...props} ref={imageRef} src={src} className={['cms-image', className].filter(Boolean).join(' ')}
    loading={priority ? 'eager' : loading || 'lazy'} decoding={decoding}
    fetchPriority={priority ? 'high' : fetchPriority} data-image-state={state}
    onLoad={event => { setSettled({ src, failed: false }); onLoad?.(event) }}
    onError={event => { setSettled({ src, failed: true }); onError?.(event) }} />
}
