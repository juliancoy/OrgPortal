export const PIDP_BASE_URL = ((import.meta.env.VITE_PIDP_BASE_URL as string | undefined) ?? '/pidp').replace(/\/$/, '')
export const PIDP_APP_SLUG = ((import.meta.env.VITE_PIDP_APP_SLUG as string | undefined) ?? 'code-collective').trim()

export function pidpUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${PIDP_BASE_URL}${normalizedPath}`
}

export function pidpAppLoginUrl(next: string): string {
  const params = new URLSearchParams()
  params.set('next', next)
  if (PIDP_APP_SLUG) {
    params.set('app', PIDP_APP_SLUG)
  }
  return pidpUrl(`/app/login?${params.toString()}`)
}
