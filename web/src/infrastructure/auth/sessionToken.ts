import {restoreSessionToken} from './restoreSession'
import { setRuntimeAccessToken } from './runtimeAuth'

export async function refreshRuntimeTokenFromSession(): Promise<string | null> {
  try {
    const token=await restoreSessionToken()
    setRuntimeAccessToken(token)
    return token
  } catch { return null }
}
