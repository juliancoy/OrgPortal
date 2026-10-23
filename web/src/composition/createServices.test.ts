import { createServices } from './createServices'
import { LazyChatService } from '../chat/LazyChatService'
import { MockChatService } from '../infrastructure/mocks/MockChatService'

describe('createServices chat adapter wiring', () => {
  it('uses matrix chat backend by default', () => {
    const services = createServices({ dataSource: 'api' })
    expect(services.chatService).toBeInstanceOf(LazyChatService)
  })

  it('uses mock chat backend when requested', () => {
    const services = createServices({ dataSource: 'api', chatBackend: 'mock' })
    expect(services.chatService).toBeInstanceOf(MockChatService)
  })

  it('uses mock chat backend when api source is paired with mock chat provider', () => {
    const services = createServices({ dataSource: 'api', chatBackend: 'mock' })
    expect(services.chatService).toBeInstanceOf(MockChatService)
  })
})
