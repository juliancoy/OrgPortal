import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../../app/AppProviders'
import { NativeChatApi, type NativeChatConversation } from '../../chat/nativeChatApi'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'
import { useTimebankApi } from './useTimebankApi'

export type TimebankNotice = { id: string; community_id: string; type: string; actor_user_id: string; actor_user_name: string; entity_id: string; title: string; body: string; deep_link: string; created_at: string; status: 'read' | 'unread'; read_at: string | null }
type InboxPage = { items: TimebankNotice[]; unread_count: number; next_cursor: string | null }
type Inbox = {
  items: TimebankNotice[]; conversations: NativeChatConversation[]; unreadActivity: number; unreadMessages: number
  loading: boolean; error: string; chatError: string; nextCursor: string | null
  refresh: () => Promise<void>; loadMore: () => Promise<void>; markRead: (ids: string[]) => Promise<void>
}
const Context = createContext<Inbox | null>(null)
export function signalInboxChange() { window.dispatchEvent(new Event('portal:inbox-changed')) }
const mergeItems = (old: TimebankNotice[], fresh: TimebankNotice[]) => {
  const map = new Map(old.map((item) => [item.id, item]))
  fresh.forEach((item) => map.set(item.id, item))
  return [...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
}
export function TimebankInboxProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { token, user } = useAuth()
  const api = useTimebankApi()
  const chat = useMemo(() => new NativeChatApi(async () => token || refreshRuntimeTokenFromSession()), [token])
  const [items, setItems] = useState<TimebankNotice[]>([])
  const [conversations, setConversations] = useState<NativeChatConversation[]>([])
  const [unreadActivity, setUnread] = useState(0)
  const [nextCursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [chatError, setChatError] = useState('')
  const generation = useRef(0)
  const refreshSequence = useRef(0)
  const loadedMore = useRef(false)
  const refresh = useCallback(async () => {
    if (!enabled || !token) return
    const current = generation.current
    const sequence = ++refreshSequence.current
    const results = await Promise.allSettled([api<InboxPage>('/notifications'), chat.listConversations()])
    if (current !== generation.current || sequence !== refreshSequence.current) return
    if (results[0].status === 'fulfilled') {
      const page = results[0].value
      setItems((old) => mergeItems(old, page.items)); setUnread(page.unread_count)
      if (!loadedMore.current) setCursor(results[0].value.next_cursor)
      setError('')
    } else setError('Notifications could not be refreshed. Please try again.')
    if (results[1].status === 'fulfilled') { setConversations(results[1].value); setChatError('') }
    else setChatError('Messages could not be refreshed. Please try again.')
    setLoading(false)
  }, [api, chat, enabled, token])
  useEffect(() => {
    generation.current++; loadedMore.current = false
    setItems([]); setConversations([]); setUnread(0); setCursor(null); setError(''); setChatError('')
    if (!enabled || !token) { setLoading(false); return }
    setLoading(true)
    void refresh()
    const wake = () => { if (document.visibilityState === 'visible') void refresh() }
    const interval = window.setInterval(wake, 30000)
    window.addEventListener('focus', wake); window.addEventListener('online', wake)
    window.addEventListener('portal:inbox-changed', wake); document.addEventListener('visibilitychange', wake)
    return () => {
      generation.current++; window.clearInterval(interval)
      window.removeEventListener('focus', wake); window.removeEventListener('online', wake)
      window.removeEventListener('portal:inbox-changed', wake); document.removeEventListener('visibilitychange', wake)
    }
  }, [enabled, refresh, token, user?.id])
  const markRead = useCallback(async (ids: string[]) => {
    const current = generation.current
    await api('/notifications/read', { method: 'POST', body: JSON.stringify({ ids }) })
    if (current !== generation.current) return
    refreshSequence.current++
    setItems((old) => old.map((item) => ids.includes(item.id) ? { ...item, status: 'read' } : item))
    await refresh()
  }, [api, refresh])
  const loadMore = useCallback(async () => {
    if (!nextCursor) return
    const current = generation.current
    const page = await api<InboxPage>(`/notifications?before=${encodeURIComponent(nextCursor)}`)
    if (current !== generation.current) return
    loadedMore.current = true; setItems((old) => mergeItems(old, page.items)); setCursor(page.next_cursor)
  }, [api, nextCursor])
  const unreadMessages = conversations.reduce((sum, item) => sum + (item.unread_count || 0), 0)
  return <Context.Provider value={{ items, conversations, unreadActivity, unreadMessages, loading, error, chatError, nextCursor, refresh, markRead, loadMore }}>{children}</Context.Provider>
}
export function useTimebankInbox() {
  const value = useContext(Context)
  if (!value) throw new Error('Timebank inbox provider is required')
  return value
}
