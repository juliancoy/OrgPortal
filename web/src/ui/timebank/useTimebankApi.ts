import { useCallback } from 'react'
import { useAuth } from '../../app/AppProviders'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'

export type TimebankApi = <T>(path?: string, options?: RequestInit) => Promise<T>
export async function fetchTimebank(path: string, token: string | null, options: RequestInit = {}) {
  const send = (accessToken: string | null) => {
    const headers = new Headers(options.headers)
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    return fetch(`/api/org/api/timebank${path}`, { ...options, headers })
  }
  let response = await send(token)
  if (response.status === 401 && token) {
    const refreshed = await refreshRuntimeTokenFromSession()
    if (refreshed) response = await send(refreshed)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(body?.detail || `Request failed (${response.status}). Please try again.`)
  }
  return response
}
export function useTimebankApi(): TimebankApi {
  const { token } = useAuth()
  return useCallback(async <T,>(path = '', options: RequestInit = {}): Promise<T> => {
    const response = await fetchTimebank(path, token, options)
    return response.json() as Promise<T>
  }, [token])
}
