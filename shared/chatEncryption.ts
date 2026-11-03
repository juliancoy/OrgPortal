export type ChatEncryptionMode = 'none' | 'rsa' | 'rsa-mlkem'
export type EncryptedChatMode = Exclude<ChatEncryptionMode, 'none'>
export const CHAT_ENCRYPTION_MODES: ChatEncryptionMode[] = ['none', 'rsa', 'rsa-mlkem']
export const MAX_CHAT_ENCRYPTION_DEVICES = 256
export const CHAT_ENCRYPTION_LABELS: Record<ChatEncryptionMode, { label: string; description: string; color: string }> = {
  none: { label: 'Public', description: 'Message content is readable by the chat service. HTTPS still protects transport.', color: 'blue' },
  rsa: { label: 'Conventional Encryption - RSA', description: 'New messages use device-held RSA-3072 keys and AES-256-GCM.', color: 'green' },
  'rsa-mlkem': { label: 'Quantum Resistant (RSA + ML-KEM)', description: 'New messages combine RSA-3072 and ML-KEM-768 (Kyber), with AES-256-GCM. Calls and earlier messages are not covered.', color: 'purple' },
}

export type ChatDeviceKey = {
  user_id: string
  device_id: string
  rsa_jwk: { kty: 'RSA'; n: string; e: 'AQAB' }
  kem_public: string
}
export type ChatSecurity = {
  mode: ChatEncryptionMode
  revision: number
  current_user_id: string
  can_manage: boolean
  devices: ChatDeviceKey[]
  missing_members: string[]
}
export type ChatRecipientEnvelope = {
  user_id: string
  device_id: string
  rsa_ciphertext: string
  kem_ciphertext?: string
  nonce: string
  wrapped_key: string
}
export type ChatEncryptedMessage = {
  v: 1
  mode: EncryptedChatMode
  revision: number
  conversation_id: string
  client_message_id: string
  sender_user_id: string
  sender_device_id: string
  nonce: string
  ciphertext: string
  recipients: ChatRecipientEnvelope[]
}

export function encodeChatBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function decodeChatBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encrypted-message encoding')
  const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  if (encodeChatBytes(bytes) !== value) throw new Error('Noncanonical encrypted-message encoding')
  return bytes
}
export async function chatDeviceId(userId: string, rsa: ChatDeviceKey['rsa_jwk'], kem: string): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(['orgportal-chat-device-v1', userId, rsa.n, rsa.e, kem]))
  return encodeChatBytes(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
}
export function chatMessageAad(envelope: Omit<ChatEncryptedMessage, 'nonce' | 'ciphertext'>): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([
    'orgportal-chat-v1', envelope.mode, envelope.revision, envelope.conversation_id,
    envelope.client_message_id, envelope.sender_user_id, envelope.sender_device_id,
    envelope.recipients.map(r => [r.user_id, r.device_id]).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0),
  ]))
}
export function chatRecipientAad(aad: Uint8Array, recipient: Pick<ChatRecipientEnvelope, 'user_id' | 'device_id'>): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([encodeChatBytes(aad), recipient.user_id, recipient.device_id]))
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function encoded(value: unknown, length: number | [number, number]): value is string {
  if (typeof value !== 'string' || value.length > 24000) return false
  try { const n = decodeChatBytes(value).length; return typeof length === 'number' ? n === length : n >= length[0] && n <= length[1] } catch { return false }
}
export function validateChatEnvelope(value: unknown): ChatEncryptedMessage {
  if (!object(value) || value.v !== 1 || !['rsa', 'rsa-mlkem'].includes(String(value.mode)) ||
      !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 ||
      !['conversation_id', 'client_message_id', 'sender_user_id', 'sender_device_id'].every(k => typeof value[k] === 'string' && String(value[k]).length > 0 && String(value[k]).length <= 200) ||
      !encoded(value.nonce, 12) || !encoded(value.ciphertext, [17, 16016]) ||
      !Array.isArray(value.recipients) || value.recipients.length < 1 || value.recipients.length > MAX_CHAT_ENCRYPTION_DEVICES) throw new Error('Invalid encrypted message')
  const seen = new Set<string>()
  for (const r of value.recipients) {
    if (!object(r) || typeof r.user_id !== 'string' || !r.user_id.length || r.user_id.length > 200 || !encoded(r.device_id, 32) ||
        !encoded(r.rsa_ciphertext, 384) || !encoded(r.nonce, 12) || !encoded(r.wrapped_key, 48) ||
        (value.mode === 'rsa-mlkem' ? !encoded(r.kem_ciphertext, 1088) : r.kem_ciphertext !== undefined) || seen.has(r.device_id)) throw new Error('Invalid encrypted-message recipient')
    seen.add(r.device_id)
  }
  return value as ChatEncryptedMessage
}
