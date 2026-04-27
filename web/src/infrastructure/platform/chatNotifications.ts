import type { MatrixEvent } from 'matrix-js-sdk'
import { MsgType, RelationType } from 'matrix-js-sdk'
import { isNativeCapacitorRuntime } from './runtimePlatform'

type ChatNotificationPayload = {
  roomId: string
  roomName: string
  eventId: string
  senderLabel: string
  messageBody: string
}

type NotificationOpenHandler = (roomId: string) => void

let localNotificationsApi: (typeof import('@capacitor/local-notifications'))['LocalNotifications'] | null = null
let permissionGranted = false
let initStarted = false
let openListenerRegistered = false
let openHandler: NotificationOpenHandler | null = null
const notifiedEventIds = new Set<string>()

function toNotificationId(eventId: string): number {
  let hash = 2166136261
  for (let i = 0; i < eventId.length; i += 1) {
    hash ^= eventId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 1) || Math.floor(Date.now() / 1000)
}

function summarizeMessage(content: { msgtype?: string; body?: string }): string {
  const msgType = content.msgtype || MsgType.Text
  if (msgType === MsgType.Image) return 'sent an image'
  if (msgType === MsgType.File) return 'sent a file'
  const body = String(content.body || '').trim()
  return body || 'sent a message'
}

export async function initChatNotifications(): Promise<boolean> {
  if (!isNativeCapacitorRuntime()) return false
  if (permissionGranted) return true
  if (initStarted) return permissionGranted
  initStarted = true
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    localNotificationsApi = LocalNotifications
    await localNotificationsApi.createChannel({
      id: 'chat-messages',
      name: 'Chat Messages',
      description: 'Notifications for incoming chat messages',
      importance: 4,
      visibility: 1,
      lights: true,
      vibration: true,
    })
    let permissions = await localNotificationsApi.checkPermissions()
    if (permissions.display !== 'granted') {
      permissions = await localNotificationsApi.requestPermissions()
    }
    permissionGranted = permissions.display === 'granted'
    if (permissionGranted && !openListenerRegistered) {
      await localNotificationsApi.addListener('localNotificationActionPerformed', (event) => {
        const roomId = String(event.notification.extra?.roomId || '').trim()
        if (!roomId) return
        openHandler?.(roomId)
      })
      openListenerRegistered = true
    }
    return permissionGranted
  } catch {
    permissionGranted = false
    return false
  }
}

export function setChatNotificationOpenHandler(handler: NotificationOpenHandler): void {
  openHandler = handler
}

export async function notifyChatMessage(payload: ChatNotificationPayload): Promise<void> {
  if (!isNativeCapacitorRuntime()) return
  if (notifiedEventIds.has(payload.eventId)) return
  const initialized = await initChatNotifications()
  if (!initialized || !localNotificationsApi) return
  notifiedEventIds.add(payload.eventId)
  await localNotificationsApi.schedule({
    notifications: [
      {
        id: toNotificationId(payload.eventId),
        title: `${payload.senderLabel} · ${payload.roomName}`,
        body: payload.messageBody,
        channelId: 'chat-messages',
        extra: {
          roomId: payload.roomId,
          eventId: payload.eventId,
        },
      },
    ],
  })
}

export function buildChatNotificationPayload(args: {
  event: MatrixEvent
  roomId: string
  roomName: string
  myUserId: string | null
}): ChatNotificationPayload | null {
  const { event, roomId, roomName, myUserId } = args
  const eventId = event.getId()
  if (!eventId) return null
  const sender = event.getSender() || ''
  if (myUserId && sender === myUserId) return null
  const content = event.getContent() as {
    msgtype?: string
    body?: string
    ['m.relates_to']?: {
      rel_type?: string
    }
  }
  if (!content) return null
  if (content['m.relates_to']?.rel_type === RelationType.Replace) return null
  const messageBody = summarizeMessage(content)
  const senderLabel = sender.split(':')[0].replace(/^@/, '') || 'Someone'
  return {
    roomId,
    roomName: roomName || roomId,
    eventId,
    senderLabel,
    messageBody,
  }
}

