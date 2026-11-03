import { webcrypto } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { clearQueuedChatMessages, queueChatMessage, queuedChatMessages, queuedMessageReady, removeQueuedChatMessage, type QueuedChatMessage } from './chatOutbox'
import type { ChatSecurity } from '../../../shared/chatEncryption'

beforeAll(() => { vi.stubGlobal('crypto', webcrypto) })
const message = (): QueuedChatMessage => ({id:'queued-one',userId:'outbox-alice',roomId:'room-one',body:'A private queued greeting',mode:'rsa-mlkem',createdAt:Date.now()})
const security = (): ChatSecurity => ({current_user_id:'outbox-alice',mode:'rsa-mlkem',revision:4,can_manage:false,devices:[],missing_members:[]})

describe('encrypted browser chat queue', () => {
  it('requires keys, the original mode and the original account before sending', () => {
    const item=message(), state=security()
    expect(queuedMessageReady(item,state)).toBe(true)
    for (const change of [{missing_members:['bob']},{mode:'rsa' as const},{mode:'none' as const},{current_user_id:'bob'}]) expect(queuedMessageReady(item,{...state,...change})).toBe(false)
    expect(queuedMessageReady({...item,createdAt:Date.now()-7*86400000},state)).toBe(false)
    expect(queuedMessageReady({...item,mode:'none'},{...state,mode:'none',missing_members:['bob']})).toBe(true)
  })
  it('persists ciphertext, restores in order, isolates rooms/accounts and supports cancellation and expiry', async () => {
    const first=message(), second={...first,id:'queued-two',body:'Second private greeting',createdAt:first.createdAt+1}
    await clearQueuedChatMessages(first.userId)
    await queueChatMessage(first); await queueChatMessage(second)
    const stored=await new Promise<unknown[]>(resolve=>{const req=indexedDB.open('orgportal-chat-outbox-v1');req.onsuccess=()=>{const db=req.result;const read=db.transaction('messages').objectStore('messages').getAll();read.onsuccess=()=>{resolve(read.result);db.close()}}})
    expect(JSON.stringify(stored)).not.toContain(first.body)
    expect(await queuedChatMessages(first.userId,first.roomId)).toEqual([first,second])
    expect(await queuedChatMessages('bob',first.roomId)).toEqual([])
    expect(await queuedChatMessages(first.userId,'another-room')).toEqual([])
    await removeQueuedChatMessage(first.id)
    expect(await queuedChatMessages(first.userId,first.roomId)).toEqual([second])
    expect(await queuedChatMessages(first.userId,first.roomId,second.createdAt+7*86400000)).toEqual([])
    expect(await queuedChatMessages(first.userId,first.roomId)).toEqual([])
  },30000)
})
