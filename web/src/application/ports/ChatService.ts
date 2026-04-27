import type { MatrixClient } from 'matrix-js-sdk'

export type ChatSession = {
  accessToken: string
  userId: string
  deviceId?: string
}

export type ChatRoomSummary = {
  id: string
  name: string
  unreadCount: number
  lastActivityTs?: number
}

export type ChatMessage = {
  id: string
  sender: string
  body: string
  ts: number
  edited?: boolean
  replyToEventId?: string
  threadRootEventId?: string
  messageType?: 'text' | 'image' | 'file'
  mediaUrl?: string
  mediaMimeType?: string
  mediaFileName?: string
  reactions?: Array<{
    key: string
    count: number
  }>
}

export interface ChatService {
  start(session: ChatSession): Promise<MatrixClient>
  stop(): void
  getClient(): MatrixClient
  verifySession(): Promise<void>
  listJoinedRooms(): ChatRoomSummary[]
  listPublicRooms(limit?: number): Promise<ChatRoomSummary[]>
  joinRoom(roomId: string): Promise<void>
  listMessages(roomId: string): ChatMessage[]
  sendTextMessage(roomId: string, body: string): Promise<void>
  sendReaction(roomId: string, eventId: string, key: string): Promise<void>
  sendMediaMessage(roomId: string, file: File): Promise<void>
  sendReplyMessage(roomId: string, eventId: string, body: string): Promise<void>
  sendThreadReplyMessage(roomId: string, threadRootEventId: string, parentEventId: string, body: string): Promise<void>
  editMessage(roomId: string, eventId: string, body: string): Promise<void>
  deleteMessage(roomId: string, eventId: string): Promise<void>
}
