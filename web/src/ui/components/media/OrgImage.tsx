import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

const ORG_PLACEHOLDER_SRC = '/images/org-placeholder.svg'

type OrgImageProps = {
  src?: string | null
  alt: string
  className?: string
  style?: CSSProperties
  fallbackLetter?: string
}

function safeInitial(value: string | undefined): string {
  const trimmed = (value || '').trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : 'O'
}

export function OrgImage(props: OrgImageProps) {
  const { src, alt, className, style, fallbackLetter } = props
  const [errored, setErrored] = useState(false)
  const finalSrc = useMemo(() => {
    const candidate = (src || '').trim()
    if (!candidate || errored) return ORG_PLACEHOLDER_SRC
    return candidate
  }, [src, errored])

  return (
    <img
      src={finalSrc}
      alt={alt}
      className={className}
      style={style}
      data-fallback-letter={safeInitial(fallbackLetter || alt)}
      onError={() => setErrored(true)}
    />
  )
}
