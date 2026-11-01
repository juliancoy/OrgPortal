import { chatDeviceId, chatMessageAad, chatRecipientAad, decodeChatBytes, encodeChatBytes, MAX_CHAT_ENCRYPTION_DEVICES,
  validateChatEnvelope, type ChatDeviceKey, type ChatEncryptedMessage, type ChatSecurity } from '../../../shared/chatEncryption'

export type BrowserChatKeys = { public_key: ChatDeviceKey; rsa_private: CryptoKey; kem_seed: Uint8Array<ArrayBuffer> }
type StoredKeys = BrowserChatKeys & { user_id: string; created_at: string }
const databaseName = 'orgportal-chat-encryption-v1'
const pending = new Map<string, Promise<BrowserChatKeys>>()
const kem = () => import('mlkem-wasm').then(module => module.default)
const random = (size: number) => crypto.getRandomValues(new Uint8Array(size))
const buffer = (bytes: Uint8Array): ArrayBuffer => Uint8Array.from(bytes).buffer

async function database(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) throw new Error('Encrypted chat requires a secure browser with local key storage.')
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('devices', { keyPath: 'user_id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Browser encryption keys could not be opened.'))
  })
}
export async function existingChatKeys(userId: string): Promise<BrowserChatKeys | null> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('devices', 'readonly'), request = tx.objectStore('devices').get(userId)
    tx.oncomplete = () => { db.close(); resolve((request.result as StoredKeys | undefined) || null) }
    tx.onerror = tx.onabort = () => { db.close(); reject(new Error('Browser encryption keys could not be read.')) }
  })
}
export async function generateChatKeys(userId: string): Promise<BrowserChatKeys> {
  const rsa = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['encrypt', 'decrypt'])
  const exported = await crypto.subtle.exportKey('jwk', rsa.publicKey)
  const rsaPublic: ChatDeviceKey['rsa_jwk'] = { kty: 'RSA', n: exported.n!, e: 'AQAB' }
  const mlkem = await kem(), keys = await mlkem.generateKey('ML-KEM-768', true, ['encapsulateBits', 'decapsulateBits'])
  const kemPublic = encodeChatBytes(new Uint8Array(await mlkem.exportKey('raw-public', keys.publicKey)))
  const id = await chatDeviceId(userId, rsaPublic, kemPublic)
  return { public_key: { user_id: userId, device_id: id, rsa_jwk: rsaPublic, kem_public: kemPublic },
    rsa_private: rsa.privateKey, kem_seed: new Uint8Array(await mlkem.exportKey('raw-seed', keys.privateKey)) }
}
export async function browserChatKeys(userId: string): Promise<BrowserChatKeys> {
  const previous = pending.get(userId)
  if (previous) return previous
  const promise = (async () => {
    const existing = await existingChatKeys(userId)
    if (existing) return existing
    const candidate = await generateChatKeys(userId), db = await database()
    // Resolve concurrent tabs with a single read/write transaction: never
    // overwrite a private key that another tab already persisted/published.
    return new Promise<BrowserChatKeys>((resolve, reject) => {
      const tx = db.transaction('devices', 'readwrite'), store = tx.objectStore('devices'), read = store.get(userId)
      let selected: BrowserChatKeys = candidate
      read.onsuccess = () => {
        if (read.result) selected = read.result as StoredKeys
        else store.add({ ...candidate, user_id: userId, created_at: new Date().toISOString() } satisfies StoredKeys)
      }
      tx.oncomplete = () => { db.close(); resolve(selected) }
      tx.onerror = tx.onabort = () => { db.close(); reject(new Error('Browser encryption keys could not be saved.')) }
    })
  })()
  pending.set(userId, promise)
  try { return await promise } finally { pending.delete(userId) }
}
export async function forgetChatKeys(userId: string): Promise<void> {
  // Wait for an in-flight initialization before deleting its durable result.
  await pending.get(userId)?.catch(() => {})
  pending.delete(userId)
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('devices', 'readwrite')
    tx.objectStore('devices').delete(userId)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = tx.onabort = () => { db.close(); reject(new Error('Browser encryption keys could not be removed.')) }
  })
}

async function wrappingKey(rsaSecret: Uint8Array, kemSecret: Uint8Array, aad: Uint8Array, recipientAad: Uint8Array): Promise<CryptoKey> {
  const combined = new Uint8Array(rsaSecret.length + kemSecret.length)
  combined.set(rsaSecret); combined.set(kemSecret, rsaSecret.length)
  try {
    const material = await crypto.subtle.importKey('raw', combined, 'HKDF', false, ['deriveKey'])
    return await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: await crypto.subtle.digest('SHA-256', buffer(aad)), info: buffer(recipientAad) },
      material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  } finally { combined.fill(0) }
}

export async function encryptChatBody(body: string, conversationId: string, clientId: string, security: ChatSecurity, keys: BrowserChatKeys): Promise<ChatEncryptedMessage> {
  if (security.mode === 'none') throw new Error('This chat does not require encryption')
  if (security.current_user_id !== keys.public_key.user_id) throw new Error('This browser key belongs to a different account.')
  if (!body.trim() || body.length > 4000) throw new Error('Messages must contain between 1 and 4000 characters.')
  if (security.missing_members.length) throw new Error('Waiting for every member to open this chat and set up encryption. Your message has not been sent.')
  if (!security.devices.length || security.devices.length > MAX_CHAT_ENCRYPTION_DEVICES || !security.devices.some(device => device.device_id === keys.public_key.device_id)) throw new Error('Chat device keys changed. Refresh before sending.')
  const recipients = security.devices.map(device => ({ user_id: device.user_id, device_id: device.device_id, rsa_ciphertext: '', nonce: '', wrapped_key: '' }))
  const envelope: ChatEncryptedMessage = { v: 1, mode: security.mode, revision: security.revision, conversation_id: conversationId,
    client_message_id: clientId, sender_user_id: security.current_user_id, sender_device_id: keys.public_key.device_id,
    nonce: encodeChatBytes(random(12)), ciphertext: '', recipients }
  const aad = chatMessageAad(envelope), contentBytes = random(32)
  try {
    const contentKey = await crypto.subtle.importKey('raw', contentBytes, 'AES-GCM', false, ['encrypt'])
    envelope.ciphertext = encodeChatBytes(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: decodeChatBytes(envelope.nonce), additionalData: aad }, contentKey, new TextEncoder().encode(body))))
    for (let i = 0; i < security.devices.length; i++) {
      const device = security.devices[i], recipient = envelope.recipients[i], recipientAad = chatRecipientAad(aad, recipient), rsaSecret = random(32)
      let kemSecret = new Uint8Array(0)
      try {
        const rsaKey = await crypto.subtle.importKey('jwk', device.rsa_jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
        recipient.rsa_ciphertext = encodeChatBytes(new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP', label: recipientAad }, rsaKey, rsaSecret)))
        if (security.mode === 'rsa-mlkem') {
          const mlkem = await kem(), publicKey = await mlkem.importKey('raw-public', decodeChatBytes(device.kem_public), 'ML-KEM-768', false, ['encapsulateBits'])
          const encapsulated = await mlkem.encapsulateBits('ML-KEM-768', publicKey)
          kemSecret = new Uint8Array(encapsulated.sharedKey)
          recipient.kem_ciphertext = encodeChatBytes(new Uint8Array(encapsulated.ciphertext))
        }
        const key = await wrappingKey(rsaSecret, kemSecret, aad, recipientAad)
        const nonce = random(12)
        recipient.nonce = encodeChatBytes(nonce)
        recipient.wrapped_key = encodeChatBytes(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: recipientAad }, key, contentBytes)))
      } finally { rsaSecret.fill(0); kemSecret.fill(0) }
    }
    return envelope
  } finally { contentBytes.fill(0) }
}

export async function decryptChatBody(value: unknown, keys: BrowserChatKeys): Promise<string> {
  const envelope = validateChatEnvelope(value)
  const recipient = envelope.recipients.find(device => device.device_id === keys.public_key.device_id && device.user_id === keys.public_key.user_id)
  if (!recipient) throw new Error('This browser does not have the key for this message.')
  const aad = chatMessageAad(envelope), recipientAad = chatRecipientAad(aad, recipient)
  const rsaSecret = new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP', label: recipientAad }, keys.rsa_private, decodeChatBytes(recipient.rsa_ciphertext)))
  let kemSecret = new Uint8Array(0), contentBytes = new Uint8Array(0)
  try {
    if (envelope.mode === 'rsa-mlkem') {
      const mlkem = await kem(), privateKey = await mlkem.importKey('raw-seed', keys.kem_seed, 'ML-KEM-768', false, ['decapsulateBits'])
      kemSecret = new Uint8Array(await mlkem.decapsulateBits('ML-KEM-768', privateKey, decodeChatBytes(recipient.kem_ciphertext!)))
    }
    const wrapKey = await wrappingKey(rsaSecret, kemSecret, aad, recipientAad)
    contentBytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeChatBytes(recipient.nonce), additionalData: recipientAad }, wrapKey, decodeChatBytes(recipient.wrapped_key)))
    const contentKey = await crypto.subtle.importKey('raw', contentBytes, 'AES-GCM', false, ['decrypt'])
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeChatBytes(envelope.nonce), additionalData: aad }, contentKey, decodeChatBytes(envelope.ciphertext))
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext)
  } finally { rsaSecret.fill(0); kemSecret.fill(0); contentBytes.fill(0) }
}
