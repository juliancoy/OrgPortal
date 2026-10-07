import { portalAssetPath } from '../../../config/portalBase'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

const ORG_PLACEHOLDER_SRC = '/images/org-placeholder.svg'

type OrgImageProps = {
  src?: string | null
  alt: string
  className?: string
  style?: CSSProperties
  fallbackSrc?: string | null
  fallbackLetter?: string
}

function safeInitial(value: string | undefined): string {
  const trimmed = (value || '').trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : 'O'
}

export function OrgImage(props: OrgImageProps) {
  const { src, alt, className, style, fallbackLetter, fallbackSrc } = props
  const [failedSources, setFailedSources] = useState<string[]>([])
  useEffect(() => { setFailedSources([]) }, [src, fallbackSrc])
  const candidates = [src?.trim(), fallbackSrc?.trim(), ORG_PLACEHOLDER_SRC].filter((candidate): candidate is string => Boolean(candidate))
  const finalSrc = candidates.find(candidate => !failedSources.includes(candidate)) || ORG_PLACEHOLDER_SRC

  return (
    <img
      src={portalAssetPath(finalSrc)}
      alt={alt}
      className={className}
      style={style}
      data-fallback-letter={safeInitial(fallbackLetter || alt)}
      onError={() => setFailedSources(previous => previous.includes(finalSrc) ? previous : [...previous, finalSrc])}
    />
  )
}
