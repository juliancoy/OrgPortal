import { describe, expect, it } from 'vitest'
import { conversationChatPath, organizationChatPath, organizationChatSlug } from './chatLinks'

describe('native chat entry links', () => {
  it('opens the intended organization for both current and older Message Group links', () => {
    for (const start of ['org', 'group']) expect(organizationChatSlug(new URLSearchParams({ start, org: 'lifetech' }))).toBe('lifetech')
    expect(organizationChatSlug(new URLSearchParams('start=dm&org=lifetech'))).toBeNull()
    expect(organizationChatSlug(new URLSearchParams('start=org&org=%20'))).toBeNull()
  })
  it('encodes identifiers without introducing another destination or account', () => {
    const path = organizationChatPath('lifetech&user=another')
    const params = new URL(path, 'https://local.test').searchParams
    expect(organizationChatSlug(params)).toBe('lifetech&user=another')
    expect(params.has('user')).toBe(false)
    expect(params.has('token')).toBe(false)
    expect(conversationChatPath('room/a?token=secret')).toBe('/chat/room%2Fa%3Ftoken%3Dsecret')
  })
})
