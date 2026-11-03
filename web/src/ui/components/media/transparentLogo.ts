import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
/** Inspect decoded pixels locally; never upload or rewrite the original image. */
export function useTransparentLogo() {
  const [transparentSource, setTransparentSource] = useState('')
  const observer = useRef<ResizeObserver | null>(null)
  useEffect(() => () => observer.current?.disconnect(), [])
  function inspect(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget
    try {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 32
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context || !image.naturalWidth || !image.naturalHeight) return
      context.drawImage(image, 0, 0, 32, 32)
      const pixels = context.getImageData(0, 0, 32, 32).data
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] < 250) {
          const resize = () => image.style.setProperty('--transparent-logo-padding', `${Math.min(image.clientWidth, image.clientHeight) * 0.15}px`)
          observer.current?.disconnect()
          observer.current = new ResizeObserver(resize)
          observer.current.observe(image)
          resize()
          setTransparentSource(image.currentSrc || image.src)
          return
        }
      }
    } catch { /* Cross-origin images without CORS retain their existing presentation. */ }
  }
  return { inspect, isTransparent: (src: string) => {
    if (!transparentSource) return false
    try { return transparentSource === new URL(src, document.baseURI).href } catch { return false }
  } }
}
