import { MockChatService } from './MockChatService'

describe('MockChatService', () => {
  it('supports room listing, join, and send flows', async () => {
    const service = new MockChatService()
    await service.start({ accessToken: 'mock_token', userId: '@tester:mock.local' })
    await service.verifySession()

    const joinedBefore = service.listJoinedRooms()
    expect(joinedBefore.length).toBeGreaterThan(0)

    const publicRooms = await service.listPublicRooms()
    expect(publicRooms.length).toBeGreaterThan(0)

    const targetRoomId = publicRooms[0].id
    await service.joinRoom(targetRoomId)
    const joinedAfter = service.listJoinedRooms()
    expect(joinedAfter.some((room) => room.id === targetRoomId)).toBe(true)

    const beforeMessages = service.listMessages(targetRoomId).length
    await service.sendTextMessage(targetRoomId, 'hello from mock')
    const latestEventId = service.listMessages(targetRoomId).at(-1)?.id
    if (latestEventId) {
      await service.sendReaction(targetRoomId, latestEventId, '🔥')
      await service.editMessage(targetRoomId, latestEventId, 'edited from mock')
      await service.sendReplyMessage(targetRoomId, latestEventId, 'reply from mock')
      await service.sendThreadReplyMessage(targetRoomId, latestEventId, latestEventId, 'thread from mock')
    }
    await service.sendMediaMessage(targetRoomId, new File(['img'], 'photo.png', { type: 'image/png' }))
    const replyEventId = service.listMessages(targetRoomId).find((message) => message.body === 'reply from mock')?.id
    if (replyEventId) {
      await service.deleteMessage(targetRoomId, replyEventId)
    }
    const afterMessages = service.listMessages(targetRoomId)
    expect(afterMessages.length).toBe(beforeMessages + 3)
    expect(afterMessages.some((message) => message.body === 'thread from mock' && message.threadRootEventId)).toBe(true)
    const edited = afterMessages.find((message) => message.body === 'edited from mock')
    expect(edited?.edited).toBe(true)
    expect(edited?.reactions?.some((reaction) => reaction.key === '🔥')).toBe(true)
    expect(afterMessages[afterMessages.length - 1].messageType).toBe('image')
  })

  it('throws if getClient is called before start', () => {
    const service = new MockChatService()
    expect(() => service.getClient()).toThrow(/not initialized/i)
  })
})
