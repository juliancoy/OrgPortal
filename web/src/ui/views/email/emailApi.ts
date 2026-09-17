import { refreshRuntimeTokenFromSession } from '../../../infrastructure/auth/sessionToken'

export async function emailApi<T>(token: string | null, path: string, method = 'GET', body?: unknown): Promise<T> {
  const send = (accessToken: string | null) => fetch(`/api/org/api/email${path}`, {
    method, credentials: 'include', cache: 'no-store',
    headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let response = await send(token)
  if (response.status === 401) {
    const refreshed = await refreshRuntimeTokenFromSession()
    if (refreshed) response = await send(refreshed)
  }
  const result = await response.json().catch(() => ({})) as T & { detail?: string }
  if (!response.ok) throw new Error(result.detail || 'Unable to complete this email action. Please try again.')
  return result
}

export type EmailSender = { configured: boolean; sending_enabled: boolean; connected: boolean; status: string; email: string; daily_limit: number; used_today: number; cooldown_until: number }
export type CampaignSummary = { id: string; subject: string; status: string; created_at: number; scheduled_at: number; recipient_count: number; sent_count: number }
export type CampaignPreview = CampaignSummary & {
  sender_email: string; audience: string; body: string; event_id: string; fingerprint: string;
  preview: { subject: string; html: string; text: string }; counts: Record<string, number>;
  deliveries: { id: string; email: string; name: string; status: string; kind: string; error: string | null; gmail_message_id: string | null }[]
}
export type EmailAudience = { event_count: number; organization_count: number; contacts: { id: string; name: string; email: string }[] }
