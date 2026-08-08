import type { MatrixClient } from 'matrix-js-sdk'
import { portalBasePath, portalPath } from '../../config/portalBase'

const ORG_API_BASE = '/api/org'
const REGISTRATION_STORAGE_KEY = 'orgportal.webPush.registration'

export type WebPushState = 'unsupported' | 'unconfigured' | 'denied' | 'disabled' | 'enabled'

type PushStatus = {
  configured: boolean
  public_key: string | null
  subscription_ids: string[]
}

type StoredRegistration = {
  id: string
  gatewayUrl: string
}

function orgUrl(path: string): string {
  return `${ORG_API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & { detail?: string }
  if (!response.ok) throw new Error(payload.detail || `Request failed (${response.status})`)
  return payload
}

export function supportsWebPush(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

function saveRegistration(registration: StoredRegistration | null): void {
  if (registration) localStorage.setItem(REGISTRATION_STORAGE_KEY, JSON.stringify(registration))
  else localStorage.removeItem(REGISTRATION_STORAGE_KEY)
}

function loadRegistration(): StoredRegistration | null {
  try {
    const value = JSON.parse(localStorage.getItem(REGISTRATION_STORAGE_KEY) || 'null') as StoredRegistration | null
    return value?.id && value.gatewayUrl ? value : null
  } catch {
    return null
  }
}

async function fetchStatus(token: string): Promise<PushStatus> {
  return readJson<PushStatus>(await fetch(orgUrl('/api/network/push/status'), { headers: authHeaders(token) }))
}

export async function getWebPushState(token: string): Promise<WebPushState> {
  if (!supportsWebPush()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const status = await fetchStatus(token)
  if (!status.configured || !status.public_key) return 'unconfigured'
  const registration = await navigator.serviceWorker.getRegistration(`${portalBasePath()}/`)
  const subscription = await registration?.pushManager.getSubscription()
  const saved = loadRegistration()
  return subscription && saved && status.subscription_ids.includes(saved.id) ? 'enabled' : 'disabled'
}

export async function enableWebPush(token: string): Promise<void> {
  if (!supportsWebPush()) throw new Error('This browser does not support Web Push notifications.')
  const status = await fetchStatus(token)
  if (!status.configured || !status.public_key) throw new Error('Push notifications are not configured on the server.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')

  const registration = await navigator.serviceWorker.register(portalPath('/push-sw.js'), {
    scope: `${portalBasePath()}/`,
  })
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBytes(status.public_key),
  })
  const saved = await readJson<{ id: string; gateway_url: string }>(await fetch(orgUrl('/api/network/push/subscriptions'), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(subscription.toJSON()),
  }))
  saveRegistration({ id: saved.id, gatewayUrl: saved.gateway_url })
}

export async function disableWebPush(token: string): Promise<void> {
  if (!supportsWebPush()) return
  const status = await fetchStatus(token)
  await Promise.all(status.subscription_ids.map(async (id) => {
    await readJson(await fetch(orgUrl(`/api/network/push/subscriptions/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: authHeaders(token),
    }))
  }))
  const registration = await navigator.serviceWorker.getRegistration(`${portalBasePath()}/`)
  await (await registration?.pushManager.getSubscription())?.unsubscribe()
  saveRegistration(null)
}

export async function registerMatrixWebPusher(client: MatrixClient): Promise<void> {
  const registration = loadRegistration()
  if (!registration) return
  await client.setPusher({
    app_display_name: 'Code Collective Portal',
    app_id: 'org.codecollective.portal.web',
    data: { format: 'event_id_only', url: registration.gatewayUrl },
    device_display_name: 'Web browser',
    kind: 'http',
    lang: navigator.language || 'en',
    pushkey: registration.id,
    append: true,
  })
}
