import type { MatrixSession } from './matrixSession'
import { saveMatrixSession } from './matrixSession'
import { refreshRuntimeTokenFromSession } from '../infrastructure/auth/sessionToken'

const ORG_API_BASE = '/api/org'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type OrgChatBootstrapResponse = {
  access_token?: string
  user_id?: string
  device_id?: string
}

async function requestBootstrap(token: string): Promise<Response> {
  return fetch(orgUrl('/api/network/chat/bootstrap'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function bootstrapMatrixSessionFromOrg(token: string): Promise<MatrixSession> {
  let response = await requestBootstrap(token)
  if (response.status === 401) {
    const refreshed = await refreshRuntimeTokenFromSession()
    if (refreshed) {
      response = await requestBootstrap(refreshed)
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Org chat bootstrap failed (${response.status})`)
  }

  const payload = (await response.json()) as OrgChatBootstrapResponse
  const accessToken = payload.access_token?.trim() || ''
  const userId = payload.user_id?.trim() || ''
  if (!accessToken || !userId) {
    throw new Error('Org chat bootstrap response was missing access_token or user_id')
  }

  const session: MatrixSession = {
    accessToken,
    userId,
    deviceId: payload.device_id,
  }
  saveMatrixSession(session)
  return session
}
