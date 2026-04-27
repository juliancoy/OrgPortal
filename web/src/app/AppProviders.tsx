import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppServices } from '../composition/createServices'
import type { UserRole } from '../domain/user/User'
import type { SessionUser } from '../ui/auth/SessionUser'
import { readVotes, writeVotes, readComments, writeComments, readProfiles, writeProfiles } from '../infrastructure/utils/localStorage'
import { setRuntimeAccessToken } from '../infrastructure/auth/runtimeAuth'
import { refreshRuntimeTokenFromSession } from '../infrastructure/auth/sessionToken'
import { PIDP_BASE_URL, pidpUrl } from '../config/pidp'
import { isNativeCapacitorRuntime } from '../infrastructure/platform/runtimePlatform'
import { initChatNotifications, setChatNotificationOpenHandler } from '../infrastructure/platform/chatNotifications'

type PidpUser = {
  id: string
  email: string
  full_name: string | null
  avatar_url?: string | null
  identity_data?: {
    display_name?: string | null
    avatar_url?: string | null
    first_name?: string | null
    last_name?: string | null
  } | null
}

type ServicesContextValue = {
  services: AppServices
}

const ServicesContext = createContext<ServicesContextValue | null>(null)

export function useServices(): AppServices {
  const ctx = useContext(ServicesContext)
  if (!ctx) throw new Error('useServices must be used within AppProviders')
  return ctx.services
}

type AuthContextValue = {
  role: UserRole | 'guest'
  user: SessionUser | null
  token: string | null
  isLoading: boolean
  setRole: (role: UserRole | 'guest') => void
  setUser: (user: SessionUser | null) => void
  loginWithPassword: (email: string, password: string) => Promise<void>
  registerWithPassword: (email: string, password: string, fullName?: string) => Promise<void>
  completeOAuthLogin: (token: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const NATIVE_TOKEN_STORAGE_KEY = 'pidp.native.token'

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AppProviders')
  return ctx
}

function readInitialRole(): UserRole | 'guest' {
  const value = localStorage.getItem('demo.role')
  if (value === 'campaign_manager' || value === 'constituent' || value === 'guest') return value
  return 'guest'
}

function readInitialUser(): SessionUser | null {
  const raw = localStorage.getItem('pidp.user')
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}

function readInitialToken(): string | null {
  return null
}

function decodeJwtExpiry(token: string | null): number | null {
  if (!token) return null
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const parsed = JSON.parse(atob(padded)) as { exp?: number }
    return typeof parsed.exp === 'number' ? parsed.exp : null
  } catch {
    return null
  }
}

export function AppProviders(props: { services: AppServices; children: ReactNode }) {
  const isNativeRuntime = isNativeCapacitorRuntime()
  const [role, setRoleState] = useState<UserRole | 'guest'>(() => readInitialRole())
  const [user, setUserState] = useState<SessionUser | null>(() => readInitialUser())
  const [token, setToken] = useState<string | null>(() => readInitialToken())
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [showMigration, setShowMigration] = useState(false)
  const [pendingMigration, setPendingMigration] = useState<{guestId: string, userId: string, displayName: string} | null>(null)

  const normalizedPidpBase = PIDP_BASE_URL

  useEffect(() => {
    if (!isNativeRuntime) return
    setChatNotificationOpenHandler((roomId) => {
      window.location.assign(`/chat/${encodeURIComponent(roomId)}`)
    })
    initChatNotifications().catch(() => {})
  }, [isNativeRuntime])

  const normalizeAvatarUrl = useCallback(
    (rawUrl?: string | null): string | null => {
      if (!rawUrl) return null
      if (/^(data:|https?:\/\/)/i.test(rawUrl)) return rawUrl
      if (rawUrl.startsWith(`${normalizedPidpBase}/`)) return rawUrl
      const cleaned = rawUrl.replace(/^\/+/, '')
      return `${normalizedPidpBase}/${cleaned}`
    },
    [normalizedPidpBase],
  )

  const servicesValue = useMemo<ServicesContextValue>(() => ({ services: props.services }), [props.services])

  const migrateGuestData = useCallback(() => {
    if (!pendingMigration) return
    const { guestId, userId, displayName } = pendingMigration
    // Migrate votes
    const votes = readVotes()
    for (const motionId in votes) {
      if (votes[motionId][guestId]) {
        votes[motionId][userId] = votes[motionId][guestId]
        delete votes[motionId][guestId]
      }
    }
    writeVotes(votes)
    // Migrate comments
    const comments = readComments()
    for (const comment of comments) {
      if (comment.authorId === guestId) {
        comment.authorId = userId
        comment.authorName = displayName
      }
    }
    writeComments(comments)
    // Migrate profiles
    const profiles = readProfiles()
    if (profiles[guestId]) {
      profiles[userId] = profiles[guestId]
      delete profiles[guestId]
    }
    writeProfiles(profiles)
    // Clear guestId
    localStorage.removeItem('governance.guestId')
    setShowMigration(false)
    setPendingMigration(null)
    // Reload page to update displayed comments
    window.location.reload()
  }, [pendingMigration])

  const formatApiError = useCallback(async (resp: Response, fallback: string) => {
    const data = await resp.json().catch(() => null)
    if (data && Array.isArray(data.detail)) {
      const details = data.detail
        .map((item: { loc?: (string | number)[]; msg?: string }) => {
          if (!item || !item.msg) return null
          const field = item.loc?.slice(1).join('.') ?? 'request'
          return `${field}: ${item.msg}`
        })
        .filter(Boolean)
      if (details.length) return `${fallback} ${details.join('; ')}`
    }
    if (data?.detail) return `${fallback} ${data.detail}`
    const text = await resp.text().catch(() => '')
    return text ? `${fallback} ${text}` : fallback
  }, [])

  const setAuthToken = useCallback((nextToken: string | null) => {
    setToken(nextToken)
    setRuntimeAccessToken(nextToken)
    if (isNativeRuntime) {
      if (nextToken) {
        localStorage.setItem(NATIVE_TOKEN_STORAGE_KEY, nextToken)
      } else {
        localStorage.removeItem(NATIVE_TOKEN_STORAGE_KEY)
      }
    }
  }, [isNativeRuntime])

  // Login with password.
  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      const body = new URLSearchParams()
      body.set('username', email)
      body.set('password', password)
      const endpoint = isNativeRuntime ? '/auth/token' : '/auth/session/login'
      const resp = await fetch(pidpUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        credentials: isNativeRuntime ? 'omit' : 'include',
        body,
      })
      if (!resp.ok) {
        throw new Error(await formatApiError(resp, 'Login failed.'))
      }
      if (isNativeRuntime) {
        const tokenPayload = (await resp.json().catch(() => null)) as { access_token?: string } | null
        const nextToken = tokenPayload?.access_token?.trim() || null
        if (!nextToken) {
          throw new Error('Login response did not include an access token.')
        }
        setAuthToken(nextToken)
      } else {
        // Cookie is now set; hydrate the runtime token + user profile.
        setAuthToken(null)
      }
      setIsLoading(true)
    },
    [formatApiError, isNativeRuntime, setAuthToken],
  )

  const registerWithPassword = useCallback(
    async (email: string, password: string, fullName?: string) => {
      const resp = await fetch(pidpUrl('/auth/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, full_name: fullName ?? null }),
      })
      if (!resp.ok) {
        if (resp.status === 409) {
          const data = await resp.json().catch(() => null)
          const detail =
            typeof data?.detail === 'string'
              ? data.detail
              : typeof data?.detail?.message === 'string'
                ? data.detail.message
                : null
          throw new Error(detail || 'Account already exists. Please log in.')
        }
        const message = await formatApiError(resp, `Registration failed (${resp.status}).`)
        throw new Error(message)
      }
      await loginWithPassword(email, password)
    },
    [loginWithPassword, formatApiError],
  )

  // Check for OAuth token in URL hash (for OAuth flows that return token)
  useEffect(() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
    const params = new URLSearchParams(hash || window.location.search)
    const accessToken = params.get('token')
    if (!accessToken) return

    if (!isNativeRuntime) {
      fetch(pidpUrl('/auth/session/exchange'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }).catch(() => {
        // Best-effort cookie exchange; in-memory token still supports the active session.
      })
    }

    // OAuth login successful, clear hash and hydrate session
    setAuthToken(accessToken)
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    setIsLoading(true)
  }, [isNativeRuntime, setAuthToken])

  // Main session hydration effect - uses HTTP-only cookie only
  useEffect(() => {
    if (!isLoading) return
    let cancelled = false
    const controller = new AbortController()

    async function hydrateSession() {
      try {
        let activeToken = token
        if (!activeToken) {
          if (isNativeRuntime) {
            const persistedToken = localStorage.getItem(NATIVE_TOKEN_STORAGE_KEY)
            activeToken = persistedToken?.trim() || null
            if (activeToken) {
              setAuthToken(activeToken)
            }
          } else {
            const sessionTokenResp = await fetch(pidpUrl('/auth/session-token'), {
              credentials: 'include',
              signal: controller.signal,
            })
            if (sessionTokenResp.ok) {
              const sessionTokenData = (await sessionTokenResp.json()) as { access_token?: string }
              activeToken = sessionTokenData.access_token ?? null
              if (activeToken) {
                setAuthToken(activeToken)
              }
            }
          }
        }
        if (!activeToken) throw new Error('Not authenticated')

        const resp = await fetch(pidpUrl('/auth/me'), {
          credentials: isNativeRuntime ? 'omit' : 'include',
          headers: {
            Authorization: `Bearer ${activeToken}`,
          },
          signal: controller.signal,
        })
        
        if (!resp.ok) throw new Error('Not authenticated')
        
        const data = (await resp.json()) as PidpUser
        const displayName = data.identity_data?.display_name?.trim() || data.full_name?.trim() || data.email
        const handle = data.email.split('@')[0]
        const avatarUrl = normalizeAvatarUrl(data.identity_data?.avatar_url ?? data.avatar_url)
        const firstName = data.identity_data?.first_name ?? null
        const lastName = data.identity_data?.last_name ?? null
        
        if (cancelled) return
        
        setRoleState('constituent')
        localStorage.setItem('demo.role', 'constituent')
        setUserState({
          id: data.id,
          role: 'constituent',
          displayName,
          handle,
          email: data.email,
          fullName: data.full_name,
          firstName,
          lastName,
          avatarUrl,
        })
        // Store user info (not token) in localStorage for UI state
        localStorage.setItem(
          'pidp.user',
          JSON.stringify({
            id: data.id,
            role: 'constituent',
            displayName,
            handle,
            email: data.email,
            fullName: data.full_name,
            firstName,
            lastName,
            avatarUrl,
          }),
        )
        
        // Check for guest data migration
        const guestId = localStorage.getItem('governance.guestId')
        if (guestId && guestId !== data.id) {
          const votes = readVotes()
          let hasGuestData = false
          for (const motionVotes of Object.values(votes)) {
            if (motionVotes[guestId]) {
              hasGuestData = true
              break
            }
          }
          if (hasGuestData) {
            setPendingMigration({ guestId, userId: data.id, displayName })
            setShowMigration(true)
          }
        }
      } catch {
        if (!cancelled) {
          setRoleState('guest')
          localStorage.setItem('demo.role', 'guest')
          setAuthToken(null)
          setUserState(null)
          localStorage.removeItem('pidp.user')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    hydrateSession()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [isNativeRuntime, normalizeAvatarUrl, isLoading, token, setAuthToken])

  useEffect(() => {
    if (!user) return
    if (isNativeRuntime) return
    let cancelled = false
    let expiryTimer: ReturnType<typeof setTimeout> | null = null
    let healthInterval: ReturnType<typeof setInterval> | null = null

    const runRefresh = async () => {
      const refreshed = await refreshRuntimeTokenFromSession()
      if (cancelled || !refreshed) return
      setAuthToken(refreshed)
    }

    const scheduleExpiryRefresh = (activeToken: string | null) => {
      if (expiryTimer) {
        clearTimeout(expiryTimer)
        expiryTimer = null
      }
      const exp = decodeJwtExpiry(activeToken)
      if (!exp) return
      const refreshAtMs = exp * 1000 - (2 * 60 * 1000)
      const delayMs = Math.max(refreshAtMs - Date.now(), 15_000)
      expiryTimer = setTimeout(() => {
        void runRefresh()
      }, delayMs)
    }

    scheduleExpiryRefresh(token)
    healthInterval = setInterval(() => {
      const exp = decodeJwtExpiry(token)
      if (!exp) {
        void runRefresh()
        return
      }
      const msRemaining = exp * 1000 - Date.now()
      if (msRemaining <= 3 * 60 * 1000) {
        void runRefresh()
      }
    }, 60_000)

    return () => {
      cancelled = true
      if (expiryTimer) clearTimeout(expiryTimer)
      if (healthInterval) clearInterval(healthInterval)
    }
  }, [isNativeRuntime, token, user, setAuthToken])

  useEffect(() => {
    if (!isNativeRuntime) return
    let removed = false
    let listenerHandle: { remove: () => Promise<void> } | null = null

    const consumeDeepLink = (rawUrl: string | null | undefined) => {
      const nextUrl = (rawUrl || '').trim()
      if (!nextUrl) return
      try {
        const parsed = new URL(nextUrl)
        const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash
        const params = new URLSearchParams(hash)
        const linkedToken = params.get('token')
        if (!linkedToken) return
        setAuthToken(linkedToken)
        setIsLoading(true)
      } catch {
        // Ignore malformed callback URLs from platform integrations.
      }
    }

    ;(async () => {
      try {
        const { App } = await import('@capacitor/app')
        const launch = await App.getLaunchUrl()
        consumeDeepLink(launch?.url)
        listenerHandle = await App.addListener('appUrlOpen', (event) => {
          consumeDeepLink(event.url)
        })
      } catch {
        // Running in browser or missing Capacitor plugin.
      }
    })()

    return () => {
      if (removed) return
      removed = true
      if (listenerHandle) {
        void listenerHandle.remove()
      }
    }
  }, [isNativeRuntime, setAuthToken])

  const authValue = useMemo<AuthContextValue>(
    () => ({
      role,
      user,
      token,
      isLoading,
      setRole: (r) => {
        setRoleState(r)
        localStorage.setItem('demo.role', r)
        if (r === 'guest') {
          setAuthToken(null)
          setUserState(null)
          localStorage.removeItem('pidp.user')
        }
      },
      setUser: (u) => {
        setUserState(u)
        if (!u) localStorage.removeItem('pidp.user')
        else localStorage.setItem('pidp.user', JSON.stringify(u))
      },
      loginWithPassword,
      registerWithPassword,
      completeOAuthLogin: (nextToken: string) => {
        setAuthToken(nextToken)
        setIsLoading(true)
      },
      logout: () => {
        setRoleState('guest')
        localStorage.setItem('demo.role', 'guest')
        setAuthToken(null)
        setUserState(null)
        localStorage.removeItem('pidp.user')
        if (isNativeRuntime) {
          window.location.reload()
          return
        }
        // Browser flow: clear session cookie server-side.
        fetch(pidpUrl('/auth/session/logout'), {
          method: 'POST',
          credentials: 'include',
        }).then(() => {
          window.location.reload()
        }).catch(() => {
          window.location.reload()
        })
      },
    }),
    [role, user, token, isLoading, isNativeRuntime, loginWithPassword, registerWithPassword, setAuthToken],
  )

  return (
    <ServicesContext.Provider value={servicesValue}>
      <AuthContext.Provider value={authValue}>
        <div style={{ border: role === 'guest' ? '2px solid red' : 'none', minHeight: '100vh' }}>
          {props.children}
        </div>
        {showMigration && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              background: 'var(--surface-solid)',
              padding: 20,
              borderRadius: 8,
              maxWidth: 400,
              color: 'var(--text-primary)',
            }}>
              <h3>Migrate Guest Data</h3>
              <p>You have data from guest mode. Would you like to migrate it to your account?</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowMigration(false)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--surface-soft)',
                    color: 'var(--text-primary)',
                    borderRadius: 4,
                  }}
                >
                  No
                </button>
                <button
                  onClick={migrateGuestData}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--primary)',
                    color: 'var(--btn-primary-text)',
                    border: 'none',
                    borderRadius: 4,
                  }}
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}
      </AuthContext.Provider>
    </ServicesContext.Provider>
  )
}
