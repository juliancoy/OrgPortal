import type { ChatService, ChatSession } from '../application/ports/ChatService'

/** Keep the Matrix SDK out of pages that never start chat. */
export class LazyChatService implements ChatService {
  private service: ChatService | null = null
  private loading: Promise<ChatService> | null = null

  constructor(private readonly load = async (): Promise<ChatService> => {
    const { MatrixChatService } = await import('./matrixService')
    return new MatrixChatService()
  }) {}

  async start(session: ChatSession) {
    this.loading ??= this.load().catch(error => {
      this.loading = null
      throw error
    })
    this.service = await this.loading
    return this.service.start(session)
  }

  private ready(): ChatService {
    if (!this.service) throw new Error('Chat has not been started')
    return this.service
  }

  stop() { this.service?.stop() }
  getClient() { return this.ready().getClient() }
  verifySession() { return this.ready().verifySession() }
  listJoinedRooms() { return this.service?.listJoinedRooms() ?? [] }
  listPublicRooms(limit?: number) { return this.ready().listPublicRooms(limit) }
  joinRoom(roomId: string) { return this.ready().joinRoom(roomId) }
  listMessages(roomId: string) { return this.service?.listMessages(roomId) ?? [] }
  sendTextMessage(...args: Parameters<ChatService['sendTextMessage']>) { return this.ready().sendTextMessage(...args) }
  sendReaction(...args: Parameters<ChatService['sendReaction']>) { return this.ready().sendReaction(...args) }
  sendMediaMessage(...args: Parameters<ChatService['sendMediaMessage']>) { return this.ready().sendMediaMessage(...args) }
  sendReplyMessage(...args: Parameters<ChatService['sendReplyMessage']>) { return this.ready().sendReplyMessage(...args) }
  sendThreadReplyMessage(...args: Parameters<ChatService['sendThreadReplyMessage']>) { return this.ready().sendThreadReplyMessage(...args) }
  editMessage(...args: Parameters<ChatService['editMessage']>) { return this.ready().editMessage(...args) }
  deleteMessage(...args: Parameters<ChatService['deleteMessage']>) { return this.ready().deleteMessage(...args) }
}
