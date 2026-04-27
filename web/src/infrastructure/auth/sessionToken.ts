import { pidpUrl } from '../../config/pidp'
import { setRuntimeAccessToken } from './runtimeAuth'

type SessionTokenResponse = {
  access_token?: string
}

export async function refreshRuntimeTokenFromSession(): Promise<string | null> {
  try {
    const resp = await fetch(pidpUrl('/auth/session-token'), {
      credentials: 'include',
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as SessionTokenResponse
    const token = data.access_token?.trim() || null
    if (token) {
      setRuntimeAccessToken(token)
    }
    return token
  } catch {
    return null
  }
}
