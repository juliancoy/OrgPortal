export type MatrixSession = {
  accessToken: string
  userId: string
  deviceId?: string
}

const MATRIX_SESSION_STORAGE_KEY = 'orgportal.matrix.session'

function normalizeMatrixBaseUrl(rawValue: string | undefined): string {
  const raw = (rawValue ?? '').trim()
  if (!raw) return 'https://matrix.arkavo.org'
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw.replace(/\/$/, '')
  return `https://${raw.replace(/\/$/, '')}`
}

export const MATRIX_BASE_URL = normalizeMatrixBaseUrl(
  (import.meta.env.VITE_MATRIX_BASE_URL as string | undefined) ??
    (import.meta.env.VITE_SYNAPSE_BASE_URL as string | undefined),
)

export function loadMatrixSession(): MatrixSession | null {
  const raw = localStorage.getItem(MATRIX_SESSION_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as MatrixSession
    if (!parsed?.accessToken || !parsed?.userId) return null
    return parsed
  } catch {
    return null
  }
}

export function saveMatrixSession(session: MatrixSession): void {
  localStorage.setItem(MATRIX_SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearMatrixSession(): void {
  localStorage.removeItem(MATRIX_SESSION_STORAGE_KEY)
}

export async function exchangeLoginTokenForMatrixSession(loginToken: string): Promise<MatrixSession> {
  const response = await fetch(`${MATRIX_BASE_URL}/_matrix/client/v3/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.token',
      token: loginToken,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Matrix login exchange failed (${response.status})`)
  }

  const data = (await response.json()) as {
    access_token?: string
    user_id?: string
    device_id?: string
  }
  if (!data.access_token || !data.user_id) {
    throw new Error('Matrix login response was missing access token or user id')
  }

  const session: MatrixSession = {
    accessToken: data.access_token,
    userId: data.user_id,
    deviceId: data.device_id,
  }
  saveMatrixSession(session)
  return session
}

export function beginMatrixSsoLogin(redirectPath?: string): void {
  const redirectUrl = redirectPath ?? window.location.href
  const url = `${MATRIX_BASE_URL}/_matrix/client/v3/login/sso/redirect?redirectUrl=${encodeURIComponent(redirectUrl)}`
  window.location.href = url
}

export async function bootstrapMatrixSessionFromUrl(): Promise<MatrixSession | null> {
  const params = new URLSearchParams(window.location.search)
  const loginToken = params.get('loginToken')
  if (!loginToken) return loadMatrixSession()

  const session = await exchangeLoginTokenForMatrixSession(loginToken)

  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.delete('loginToken')
  window.history.replaceState(null, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)

  return session
}
