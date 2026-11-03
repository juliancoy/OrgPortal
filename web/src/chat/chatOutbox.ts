import type { ChatEncryptionMode, ChatSecurity, ChatEncryptedMessage } from '../../../shared/chatEncryption'
import { browserChatKeys, decryptChatBody, encryptChatBody } from './chatEncryption'

const queueContext = (message: Omit<QueuedChatMessage, 'body'>) => JSON.stringify(['orgportal-outbox-v1', message.roomId, message.mode, message.createdAt])
const lifetime = 7 * 86400000
export type QueuedChatMessage = {
  id: string; userId: string; roomId: string; body: string; mode: ChatEncryptionMode; createdAt: number
}
type StoredMessage = Omit<QueuedChatMessage, 'body'> & { encrypted: ChatEncryptedMessage }

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('orgportal-chat-outbox-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('messages', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Queued messages could not be opened.'))
  })
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', mode), request = action(tx.objectStore('messages'))
    tx.oncomplete = () => { db.close(); resolve(request.result) }
    tx.onerror = tx.onabort = () => { db.close(); reject(new Error('Queued messages could not be saved.')) }
  })
}
export function queuedMessageReady(message: QueuedChatMessage, security: ChatSecurity): boolean {
  return message.userId === security.current_user_id && message.mode === security.mode &&
    message.createdAt + lifetime > Date.now() && (security.mode === 'none' || !security.missing_members.length)
}
export async function queueChatMessage(message: QueuedChatMessage): Promise<void> {
  if (!message.body.trim() || message.body.length > 4000) throw new Error('Messages must contain between 1 and 4000 characters.')
  const keys = await browserChatKeys(message.userId)
  // Local queue encryption uses only this browser's key, even for a blue chat.
  const encrypted = await encryptChatBody(message.body, queueContext(message), message.id, {
    mode: 'rsa-mlkem', revision: 0, current_user_id: message.userId, can_manage: false,
    devices: [keys.public_key], missing_members: [],
  }, keys)
  const { body: _body, ...metadata } = message
  await transaction('readwrite', store => store.put({ ...metadata, encrypted } satisfies StoredMessage))
}
export async function removeQueuedChatMessage(id: string): Promise<void> {
  await transaction('readwrite', store => store.delete(id))
}
export async function queuedChatMessages(userId: string, roomId: string, now = Date.now()): Promise<QueuedChatMessage[]> {
  const rows = await transaction('readonly', store => store.getAll()) as StoredMessage[]
  const result: QueuedChatMessage[] = []
  for (const row of rows) {
    if (row.createdAt + lifetime <= now) { await removeQueuedChatMessage(row.id); continue }
    if (row.userId !== userId || row.roomId !== roomId) continue
    const keys = await browserChatKeys(userId)
    if (row.encrypted.conversation_id !== queueContext(row) || row.encrypted.sender_user_id !== row.userId || row.encrypted.client_message_id !== row.id) throw new Error('Queued message metadata could not be verified.')
    result.push({ id: row.id, userId, roomId, mode: row.mode, createdAt: row.createdAt, body: await decryptChatBody(row.encrypted, keys) })
  }
  return result.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}
export async function clearQueuedChatMessages(userId: string): Promise<void> {
  const rows = await transaction('readonly', store => store.getAll()) as StoredMessage[]
  for (const row of rows) if (row.userId === userId) await removeQueuedChatMessage(row.id)
}
