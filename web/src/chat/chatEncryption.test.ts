import { beforeAll, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'
import { browserChatKeys, decryptChatBody, encryptChatBody, existingChatKeys, forgetChatKeys, generateChatKeys, type BrowserChatKeys } from './chatEncryption'
import { decodeChatBytes, encodeChatBytes, type ChatSecurity } from '../../../shared/chatEncryption'

let alice: BrowserChatKeys, bob: BrowserChatKeys
beforeAll(async () => {
  vi.stubGlobal('crypto', webcrypto)
  ;[alice, bob] = await Promise.all([generateChatKeys('alice'), generateChatKeys('bob')])
}, 30000)
function security(mode: ChatSecurity['mode']): ChatSecurity {
  return { mode, revision: 4, current_user_id: 'alice', can_manage: true, devices: [alice.public_key, bob.public_key], missing_members: [] }
}
describe('browser chat envelope encryption', () => {
  it.each(['rsa', 'rsa-mlkem'] as const)('%s decrypts for both recipients and rejects tampering and replay', async mode => {
    const envelope = await encryptChatBody('Hello 🟣\nPrivate content', 'room-a', 'client-a', security(mode), alice)
    expect(JSON.stringify(envelope)).not.toContain('Private content')
    expect(await decryptChatBody(envelope, alice)).toBe('Hello 🟣\nPrivate content')
    expect(await decryptChatBody(envelope, bob)).toBe('Hello 🟣\nPrivate content')
    for (const change of [
      { conversation_id: 'room-b' }, { client_message_id: 'client-b' }, { sender_user_id: 'mallory' },
      { revision: 5 }, { recipients: envelope.recipients.slice(0, 1) },
      { ciphertext: encodeChatBytes(new Uint8Array(decodeChatBytes(envelope.ciphertext).length)) },
    ]) await expect(decryptChatBody({ ...envelope, ...change }, alice)).rejects.toThrow()
    if (mode === 'rsa-mlkem') {
      const tampered = structuredClone(envelope)
      const bytes = decodeChatBytes(tampered.recipients[0].kem_ciphertext!); bytes[0] ^= 1
      tampered.recipients[0].kem_ciphertext = encodeChatBytes(bytes)
      await expect(decryptChatBody(tampered, alice)).rejects.toThrow()
      await expect(decryptChatBody({ ...envelope, mode: 'rsa' }, alice)).rejects.toThrow()
    }
  })
  it('fails closed for missing members, wrong accounts, and oversized content', async () => {
    await expect(encryptChatBody('secret', 'room', 'id', { ...security('rsa'), missing_members: ['charlie'] }, alice)).rejects.toThrow('every member')
    await expect(encryptChatBody('secret', 'room', 'id', security('rsa'), bob)).rejects.toThrow('different account')
    await expect(encryptChatBody('x'.repeat(4001), 'room', 'id', security('rsa'), alice)).rejects.toThrow('4000')
  })
  it('persists one nonextractable RSA key per account, survives reload, and can forget it', async () => {
    const [a, b] = await Promise.all([browserChatKeys('persistent'), browserChatKeys('persistent')])
    expect(a.public_key.device_id).toBe(b.public_key.device_id)
    const stored = await existingChatKeys('persistent')
    expect(stored?.public_key).toEqual(a.public_key)
    expect(stored?.rsa_private.extractable).toBe(false)
    const state: ChatSecurity = { ...security('rsa-mlkem'), current_user_id: 'persistent', devices: [a.public_key] }
    const envelope = await encryptChatBody('After reload', 'room', 'id', state, a)
    expect(await decryptChatBody(envelope, stored!)).toBe('After reload')
    expect(await existingChatKeys('different-account')).toBeNull()
    await forgetChatKeys('persistent')
    expect(await existingChatKeys('persistent')).toBeNull()
  }, 30000)
})
