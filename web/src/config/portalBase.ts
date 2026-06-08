const DEFAULT_ORIGIN = 'https://codecollective.us'

function runtimeOrigin(): string {
  return typeof window === 'undefined' ? DEFAULT_ORIGIN : window.location.origin
}

export function normalizePortalBasePath(rawBase: string, origin = runtimeOrigin()): string {
  try {
    const parsed = new URL(rawBase, origin)
    const path = parsed.pathname.replace(/\/+$/, '')
    return path === '/' ? '' : path
  } catch {
    const normalized = rawBase.startsWith('/') ? rawBase : `/${rawBase}`
    return normalized.replace(/\/+$/, '')
  }
}

export function portalBasePath(): string {
  return normalizePortalBasePath((import.meta.env.BASE_URL as string | undefined) || '/')
}

export function portalUrl(path = '/'): string {
  const basePath = portalBasePath()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${runtimeOrigin()}${basePath}${normalizedPath}`
}

export function portalPath(path = '/'): string {
  const basePath = portalBasePath()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${basePath}${normalizedPath}`
}

export function toInternalPortalPath(rawPath: string, fallback = '/'): string {
  const raw = String(rawPath || '').trim()
  if (!raw) return fallback

  try {
    const origin = runtimeOrigin()
    const parsed = new URL(raw, origin)
    if (parsed.origin !== origin) return fallback
    const basePath = portalBasePath()
    let path = `${parsed.pathname}${parsed.search}` || fallback
    if (basePath && (path === basePath || path.startsWith(`${basePath}/`) || path.startsWith(`${basePath}?`))) {
      path = path.slice(basePath.length) || '/'
      if (!path.startsWith('/')) path = `/${path}`
    }
    return path
  } catch {
    return raw.startsWith('/') ? raw : fallback
  }
}

export function publicProfileUrl(slug?: string | null, fallback?: string | null): string | null {
  const cleanSlug = String(slug || '').trim()
  if (cleanSlug) return portalUrl(`/users/${encodeURIComponent(cleanSlug)}`)
  return fallback?.trim() || null
}
