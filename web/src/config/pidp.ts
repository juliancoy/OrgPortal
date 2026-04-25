export const PIDP_BASE_URL = ((import.meta.env.VITE_PIDP_BASE_URL as string | undefined) ?? '/pidp').replace(/\/$/, '')

export function pidpUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${PIDP_BASE_URL}${normalizedPath}`
}
