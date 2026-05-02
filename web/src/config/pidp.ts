import { getNativeAuthCallbackUrl, isNativeCapacitorRuntime } from '../infrastructure/platform/runtimePlatform'

function detectLane(hostname: string): 'dev' | 'prod' {
  return hostname.startsWith('dev.') ? 'dev' : 'prod'
}

function laneCorrectHost(hostname: string, lane: 'dev' | 'prod'): string {
  if (hostname.startsWith('dev.pidp.')) {
    return lane === 'dev' ? hostname : hostname.slice(4)
  }
  if (hostname.startsWith('pidp.')) {
    return lane === 'dev' ? `dev.${hostname}` : hostname
  }
  return hostname
}

function normalizePidpBase(rawBase: string): string {
  const fallback = '/pidp'
  const trimmed = rawBase.trim()
  if (!trimmed) return fallback

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    if (isNativeCapacitorRuntime() && trimmed.startsWith('/')) {
      const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
      const nativeBase = env?.VITE_NATIVE_PIDP_BASE_URL?.trim() || 'https://dev.pidp.arkavo.org'
      return `${nativeBase.replace(/\/$/, '')}${trimmed}`
    }
    return trimmed.replace(/\/$/, '') || fallback
  }

  if (typeof window === 'undefined') {
    return parsed.toString().replace(/\/$/, '')
  }
  const lane = detectLane(window.location.hostname)
  const correctedHost = laneCorrectHost(parsed.hostname, lane)
  if (correctedHost !== parsed.hostname) {
    parsed.hostname = correctedHost
  }
  return parsed.toString().replace(/\/$/, '')
}

export const PIDP_BASE_URL = normalizePidpBase(
  (import.meta.env.VITE_PIDP_BASE_URL as string | undefined) ?? '/pidp',
)
export const PIDP_APP_SLUG = ((import.meta.env.VITE_PIDP_APP_SLUG as string | undefined) ?? 'code-collective').trim()

export function pidpUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${PIDP_BASE_URL}${normalizedPath}`
}

export function pidpAppLoginUrl(next: string): string {
  const params = new URLSearchParams()
  if (isNativeCapacitorRuntime()) {
    params.set('next', getNativeAuthCallbackUrl())
  } else {
    params.set('next', next)
  }
  if (PIDP_APP_SLUG) {
    params.set('app', PIDP_APP_SLUG)
  }
  params.set('auto', '1')
  return pidpUrl(`/app/login?${params.toString()}`)
}

export function pidpOwnerLoginUrl(next: string): string {
  const params = new URLSearchParams()
  if (isNativeCapacitorRuntime()) {
    params.set('next', getNativeAuthCallbackUrl())
  } else {
    params.set('next', next)
  }
  params.set('owner', '1')
  // Intentionally no `app` parameter: this route should mint owner-context sessions.
  return pidpUrl(`/app/login?${params.toString()}`)
}
