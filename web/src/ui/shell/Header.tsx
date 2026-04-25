import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../app/AppProviders'
import { pidpAppLoginUrl, pidpUrl } from '../../config/pidp'

const ORG_API_BASE = '/api/org'
const SEARCH_MIN_LEN = 2
const SEARCH_CACHE_MAX = 20
const THEME_STORAGE_KEY = 'orgportal.theme'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

interface NavLinkProps {
  to: string
  children: React.ReactNode
  end?: boolean
  isActive?: boolean
}

function NavLink({ to, children, end = false, isActive: forceActive }: NavLinkProps) {
  const location = useLocation()
  const isActive =
    forceActive !== undefined
      ? forceActive
      : end
        ? location.pathname === to
        : location.pathname.startsWith(to)

  return (
    <Link to={to} className={`portal-nav-link ${isActive ? 'active' : ''}`}>
      {children}
    </Link>
  )
}

type SearchOrganization = {
  id: string
  name: string
  slug: string
  image_url?: string | null
  membership_count?: number
  upcoming_events_count?: number
}

type SearchEvent = {
  id: string
  title: string
  slug: string
  image_url?: string | null
  starts_at?: string | null
  location?: string | null
}

type SearchUser = {
  user_id: string
  user_name: string
  slug: string
  photo_url?: string | null
  headline?: string | null
  upcoming_events_count?: number
}

type SearchResultItem = {
  id: string
  type: 'org' | 'event' | 'person'
  title: string
  meta?: string
  to: string
}

type SearchCacheEntry = {
  orgs: SearchOrganization[]
  events: SearchEvent[]
  users: SearchUser[]
}

function highlightMatch(text: string, query: string): React.ReactNode {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return text
  const normalizedText = text.toLowerCase()
  const idx = normalizedText.indexOf(normalizedQuery)
  if (idx < 0) return text
  const end = idx + normalizedQuery.length
  return (
    <>
      {text.slice(0, idx)}
      <mark className="portal-search-highlight">{text.slice(idx, end)}</mark>
      {text.slice(end)}
    </>
  )
}

function formatEventDate(value?: string | null): string {
  if (!value) return 'Date TBD'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return 'Date TBD'
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function Header() {
  const { role, user, logout, token } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const displayName = user?.displayName || user?.email || 'Signed in'
  const accountSettingsPath = role === 'campaign_manager' ? '/orgs/account' : '/users/account'
  const roleLabel = role === 'campaign_manager' ? 'Org' : role === 'constituent' ? 'User' : 'Guest'
  const nextUrl = window.location.href

  const [menuOpen, setMenuOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [themeMode, setThemeMode] = useState<'auto' | 'light' | 'dark'>(() => {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return raw === 'light' || raw === 'dark' || raw === 'auto' ? raw : 'auto'
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [activeResultIndex, setActiveResultIndex] = useState(-1)
  const [searchOrgs, setSearchOrgs] = useState<SearchOrganization[]>([])
  const [searchEvents, setSearchEvents] = useState<SearchEvent[]>([])
  const [searchUsers, setSearchUsers] = useState<SearchUser[]>([])

  const menuRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchCacheRef = useRef<Map<string, SearchCacheEntry>>(new Map())

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, themeMode)
    if (themeMode === 'auto') {
      document.documentElement.removeAttribute('data-theme')
      return
    }
    document.documentElement.setAttribute('data-theme', themeMode)
  }, [themeMode])

  useEffect(() => {
    if (role === 'guest' || !token) {
      setIsAdmin(false)
      return
    }
    fetch('/api/org/admin/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((resp) => (resp.ok ? resp.json() : { is_admin: false }))
      .then((data) => setIsAdmin(Boolean(data.is_admin)))
      .catch(() => setIsAdmin(false))
  }, [role, token])

  useEffect(() => {
    setMenuOpen(false)
    setSearchOpen(false)
    setActiveResultIndex(-1)
  }, [location.pathname])

  useEffect(() => {
    function handleGlobalSearchShortcut(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key !== '/') return
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return
      }
      event.preventDefault()
      searchInputRef.current?.focus()
      setSearchOpen(searchQuery.trim().length >= SEARCH_MIN_LEN)
    }

    document.addEventListener('keydown', handleGlobalSearchShortcut)
    return () => document.removeEventListener('keydown', handleGlobalSearchShortcut)
  }, [searchQuery])

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClick)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!searchRef.current) return
      if (!searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false)
        setActiveResultIndex(-1)
      }
    }
    if (searchOpen) {
      document.addEventListener('mousedown', handleClick)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [searchOpen])

  useEffect(() => {
    const query = searchQuery.trim()
    if (query.length < SEARCH_MIN_LEN) {
      setSearchLoading(false)
      setSearchError('')
      setSearchOrgs([])
      setSearchEvents([])
      setSearchUsers([])
      setActiveResultIndex(-1)
      return
    }

    const cached = searchCacheRef.current.get(query)
    if (cached) {
      searchCacheRef.current.delete(query)
      searchCacheRef.current.set(query, cached)
      setSearchError('')
      setSearchLoading(false)
      setSearchOrgs(cached.orgs)
      setSearchEvents(cached.events)
      setSearchUsers(cached.users)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearchLoading(true)
      setSearchError('')
      try {
        const encoded = encodeURIComponent(query)
        const [orgResp, eventResp, userResp] = await Promise.all([
          fetch(orgUrl(`/api/network/orgs/public?q=${encoded}&sort=popular&limit=5`), { signal: controller.signal }),
          fetch(orgUrl(`/api/network/events/public?q=${encoded}&upcoming_only=true&limit=5`), { signal: controller.signal }),
          fetch(orgUrl(`/api/network/users/public?q=${encoded}&sort=popular&limit=5`), { signal: controller.signal }),
        ])

        if (!orgResp.ok || !eventResp.ok || !userResp.ok) {
          throw new Error('Search unavailable')
        }

        const [orgRows, eventRows, userRows] = await Promise.all([
          orgResp.json() as Promise<SearchOrganization[]>,
          eventResp.json() as Promise<SearchEvent[]>,
          userResp.json() as Promise<SearchUser[]>,
        ])

        const orgs = Array.isArray(orgRows) ? orgRows : []
        const events = Array.isArray(eventRows) ? eventRows : []
        const users = Array.isArray(userRows) ? userRows : []

        searchCacheRef.current.set(query, { orgs, events, users })
        if (searchCacheRef.current.size > SEARCH_CACHE_MAX) {
          const oldestKey = searchCacheRef.current.keys().next().value
          if (oldestKey) searchCacheRef.current.delete(oldestKey)
        }

        setSearchOrgs(orgs)
        setSearchEvents(events)
        setSearchUsers(users)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setSearchError('Unable to search right now')
        setSearchOrgs([])
        setSearchEvents([])
        setSearchUsers([])
      } finally {
        setSearchLoading(false)
      }
    }, 220)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [searchQuery])

  const results = useMemo<SearchResultItem[]>(() => {
    const orgResults: SearchResultItem[] = searchOrgs.map((org) => ({
      id: `org-${org.id}`,
      type: 'org',
      title: org.name,
      meta: `${org.membership_count ?? 0} members • ${org.upcoming_events_count ?? 0} upcoming`,
      to: `/orgs/${encodeURIComponent(org.slug)}`,
    }))

    const eventResults: SearchResultItem[] = searchEvents.map((event) => ({
      id: `event-${event.id}`,
      type: 'event',
      title: event.title,
      meta: `${formatEventDate(event.starts_at)}${event.location ? ` • ${event.location}` : ''}`,
      to: `/events/${encodeURIComponent(event.slug)}`,
    }))

    const userResults: SearchResultItem[] = searchUsers.map((person) => ({
      id: `person-${person.user_id}`,
      type: 'person',
      title: person.user_name,
      meta: person.headline || `${person.upcoming_events_count ?? 0} upcoming hosted events`,
      to: `/users/${encodeURIComponent(person.slug)}`,
    }))

    return [...orgResults, ...eventResults, ...userResults]
  }, [searchEvents, searchOrgs, searchUsers])

  useEffect(() => {
    if (!results.length) {
      setActiveResultIndex(-1)
      return
    }
    if (activeResultIndex >= results.length) {
      setActiveResultIndex(results.length - 1)
    }
  }, [activeResultIndex, results])

  const hasSearchResults = results.length > 0

  function openGlobalSearchPage() {
    const query = searchQuery.trim()
    if (query.length < SEARCH_MIN_LEN) return
    navigate(`/search?q=${encodeURIComponent(query)}`)
    setSearchOpen(false)
    setActiveResultIndex(-1)
  }

  const isCivicActive =
    location.pathname === '/' ||
    location.pathname.startsWith('/events') ||
    location.pathname.startsWith('/governance') ||
    location.pathname.startsWith('/users') ||
    location.pathname.startsWith('/constituent') ||
    location.pathname.startsWith('/campaign') ||
    location.pathname.startsWith('/about') ||
    location.pathname.startsWith('/orgs/register') ||
    location.pathname.startsWith('/orgs/login') ||
    location.pathname.startsWith('/orgs/initiatives') ||
    location.pathname.startsWith('/orgs/profile') ||
    location.pathname.startsWith('/orgs/account') ||
    location.pathname.startsWith('/orgs/events') ||
    location.pathname.startsWith('/initiatives') ||
    location.pathname.startsWith('/search')
  const orgDirectoryMatch = location.pathname.match(/^\/orgs\/([^/]+)$/)
  const isOrgDirectoryActive =
    location.pathname === '/orgs' ||
    Boolean(
      orgDirectoryMatch &&
        !['register', 'login', 'initiatives', 'profile', 'account', 'events'].includes(orgDirectoryMatch[1]),
    )

  const isFinanceActive =
    location.pathname.startsWith('/ecops') ||
    location.pathname.startsWith('/send') ||
    location.pathname.startsWith('/receive') ||
    location.pathname.startsWith('/create')

  const activeDescendant =
    activeResultIndex >= 0 && activeResultIndex < results.length ? `portal-search-option-${activeResultIndex}` : undefined

  return (
    <header className="portal-header">
      <div className="portal-header-inner">
        <Link to="/" className="portal-brand">
          <img src="/laurel_wreath_logo.png" alt="Code Collective" />
          <div>
            <div className="portal-brand-title">Code Collective</div>
            <div className="portal-brand-sub">Civic Governance Portal</div>
          </div>
        </Link>

        <div className="portal-middle">
          <div className="portal-search" ref={searchRef}>
            <form
              className="portal-search-form"
              onSubmit={(event) => {
                event.preventDefault()
                if (activeResultIndex >= 0 && activeResultIndex < results.length) {
                  navigate(results[activeResultIndex].to)
                  setSearchOpen(false)
                  setActiveResultIndex(-1)
                  return
                }
                openGlobalSearchPage()
              }}
            >
              <div
                className="portal-search-combobox"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={searchOpen && searchQuery.trim().length >= SEARCH_MIN_LEN}
                aria-controls="portal-search-listbox"
              >
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                    setSearchOpen(true)
                  }}
                  onFocus={() => {
                    if (searchQuery.trim().length >= SEARCH_MIN_LEN) setSearchOpen(true)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setSearchOpen(false)
                      setActiveResultIndex(-1)
                      return
                    }

                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      if (!searchOpen) setSearchOpen(true)
                      if (!results.length) return
                      setActiveResultIndex((prev) => (prev + 1 >= results.length ? 0 : prev + 1))
                      return
                    }

                    if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      if (!searchOpen) setSearchOpen(true)
                      if (!results.length) return
                      setActiveResultIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1))
                      return
                    }

                    if (event.key === 'Enter' && activeResultIndex >= 0 && activeResultIndex < results.length) {
                      event.preventDefault()
                      navigate(results[activeResultIndex].to)
                      setSearchOpen(false)
                      setActiveResultIndex(-1)
                    }
                  }}
                  className="portal-search-input"
                  placeholder="Search orgs, events, people"
                  aria-label="Search organizations, events, and people"
                  aria-autocomplete="list"
                  aria-activedescendant={activeDescendant}
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className="portal-search-clear"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearchQuery('')
                      setSearchOpen(false)
                      setActiveResultIndex(-1)
                      searchInputRef.current?.focus()
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </form>

            {searchOpen && searchQuery.trim().length >= SEARCH_MIN_LEN ? (
              <div id="portal-search-listbox" className="portal-search-results" role="listbox" aria-label="Search results">
                {searchLoading ? <div className="portal-search-status">Searching...</div> : null}
                {!searchLoading && searchError ? <div className="portal-search-status">{searchError}</div> : null}
                {!searchLoading && !searchError && !hasSearchResults ? (
                  <div className="portal-search-status">No results found</div>
                ) : null}

                {!searchLoading && !searchError && searchOrgs.length > 0 ? (
                  <section className="portal-search-group">
                    <div className="portal-search-group-title">Orgs</div>
                    {searchOrgs.map((org) => {
                      const to = `/orgs/${encodeURIComponent(org.slug)}`
                      const resultIndex = results.findIndex((item) => item.id === `org-${org.id}`)
                      const selected = resultIndex === activeResultIndex
                      return (
                        <Link
                          id={`portal-search-option-${resultIndex}`}
                          role="option"
                          aria-selected={selected}
                          key={org.id}
                          to={to}
                          className={`portal-search-result ${selected ? 'active' : ''}`}
                          onMouseEnter={() => setActiveResultIndex(resultIndex)}
                          onClick={() => {
                            setSearchOpen(false)
                            setActiveResultIndex(-1)
                          }}
                        >
                          {org.image_url ? (
                            <img src={org.image_url} alt={org.name} className="portal-search-thumb" />
                          ) : (
                            <span className="portal-search-thumb portal-search-thumb-fallback" aria-hidden="true">
                              {org.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <span className="portal-search-result-copy">
                            <span className="portal-search-result-title">{highlightMatch(org.name, searchQuery)}</span>
                            <span className="portal-search-result-meta">
                              {org.membership_count ?? 0} members • {org.upcoming_events_count ?? 0} upcoming
                            </span>
                          </span>
                        </Link>
                      )
                    })}
                  </section>
                ) : null}

                {!searchLoading && !searchError && searchEvents.length > 0 ? (
                  <section className="portal-search-group">
                    <div className="portal-search-group-title">Events</div>
                    {searchEvents.map((eventItem) => {
                      const to = `/events/${encodeURIComponent(eventItem.slug)}`
                      const resultIndex = results.findIndex((item) => item.id === `event-${eventItem.id}`)
                      const selected = resultIndex === activeResultIndex
                      return (
                        <Link
                          id={`portal-search-option-${resultIndex}`}
                          role="option"
                          aria-selected={selected}
                          key={eventItem.id}
                          to={to}
                          className={`portal-search-result ${selected ? 'active' : ''}`}
                          onMouseEnter={() => setActiveResultIndex(resultIndex)}
                          onClick={() => {
                            setSearchOpen(false)
                            setActiveResultIndex(-1)
                          }}
                        >
                          {eventItem.image_url ? (
                            <img src={eventItem.image_url} alt={eventItem.title} className="portal-search-thumb" />
                          ) : (
                            <span className="portal-search-thumb portal-search-thumb-fallback" aria-hidden="true">
                              {eventItem.title.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <span className="portal-search-result-copy">
                            <span className="portal-search-result-title">{highlightMatch(eventItem.title, searchQuery)}</span>
                            <span className="portal-search-result-meta">
                              {formatEventDate(eventItem.starts_at)}
                              {eventItem.location ? ` • ${eventItem.location}` : ''}
                            </span>
                          </span>
                        </Link>
                      )
                    })}
                  </section>
                ) : null}

                {!searchLoading && !searchError && searchUsers.length > 0 ? (
                  <section className="portal-search-group">
                    <div className="portal-search-group-title">People</div>
                    {searchUsers.map((person) => {
                      const to = `/users/${encodeURIComponent(person.slug)}`
                      const resultIndex = results.findIndex((item) => item.id === `person-${person.user_id}`)
                      const selected = resultIndex === activeResultIndex
                      return (
                        <Link
                          id={`portal-search-option-${resultIndex}`}
                          role="option"
                          aria-selected={selected}
                          key={person.user_id}
                          to={to}
                          className={`portal-search-result ${selected ? 'active' : ''}`}
                          onMouseEnter={() => setActiveResultIndex(resultIndex)}
                          onClick={() => {
                            setSearchOpen(false)
                            setActiveResultIndex(-1)
                          }}
                        >
                          {person.photo_url ? (
                            <img src={person.photo_url} alt={person.user_name} className="portal-search-thumb" />
                          ) : (
                            <span className="portal-search-thumb portal-search-thumb-fallback" aria-hidden="true">
                              {person.user_name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <span className="portal-search-result-copy">
                            <span className="portal-search-result-title">{highlightMatch(person.user_name, searchQuery)}</span>
                            <span className="portal-search-result-meta">
                              {person.headline || `${person.upcoming_events_count ?? 0} upcoming hosted events`}
                            </span>
                          </span>
                        </Link>
                      )
                    })}
                  </section>
                ) : null}

                {!searchLoading && !searchError ? (
                  <div className="portal-search-footer">
                    <Link
                      className="portal-search-footer-link"
                      to={`/search?q=${encodeURIComponent(searchQuery.trim())}`}
                      onClick={() => setSearchOpen(false)}
                    >
                      View all results
                    </Link>
                    <Link
                      className="portal-search-footer-link"
                      to={`/search?q=${encodeURIComponent(searchQuery.trim())}&scope=orgs`}
                      onClick={() => setSearchOpen(false)}
                    >
                      See all orgs
                    </Link>
                    <Link
                      className="portal-search-footer-link"
                      to={`/search?q=${encodeURIComponent(searchQuery.trim())}&scope=events`}
                      onClick={() => setSearchOpen(false)}
                    >
                      See all events
                    </Link>
                    <Link
                      className="portal-search-footer-link"
                      to={`/search?q=${encodeURIComponent(searchQuery.trim())}&scope=people`}
                      onClick={() => setSearchOpen(false)}
                    >
                      See all people
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <nav className="portal-nav">
            <NavLink to="/" isActive={isCivicActive}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
              Civic
            </NavLink>

            <NavLink to="/events" isActive={location.pathname.startsWith('/events')}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6 2a1 1 0 000 2h8a1 1 0 100-2H6zM4 5a2 2 0 00-2 2v7a4 4 0 004 4h8a4 4 0 004-4V7a2 2 0 00-2-2H4zm2 4a1 1 0 011-1h2a1 1 0 110 2H7a1 1 0 01-1-1zm5 0a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1z" />
              </svg>
              Events
            </NavLink>

            <NavLink to="/orgs" isActive={isOrgDirectoryActive}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 2a4 4 0 100 8 4 4 0 000-8zM3 16a5 5 0 0110 0v1H3v-1zM14.5 8.5a3 3 0 100-6 3 3 0 000 6zM14 11a4 4 0 014 4v2h-3v-1a6.98 6.98 0 00-1-3.61V11z" />
              </svg>
              Orgs
            </NavLink>

            <NavLink to="/ecops" isActive={isFinanceActive}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                <path
                  fillRule="evenodd"
                  d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
                  clipRule="evenodd"
                />
              </svg>
              Finance
            </NavLink>

            <NavLink to="/admin" isActive={location.pathname === '/admin'}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                  clipRule="evenodd"
                />
              </svg>
              Admin
            </NavLink>
          </nav>
        </div>

        <div className="portal-auth">
          <label className="portal-theme-control" aria-label="Theme mode">
            <span>Theme</span>
            <select
              value={themeMode}
              onChange={(event) => setThemeMode(event.target.value as 'auto' | 'light' | 'dark')}
            >
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          {role !== 'guest' ? (
            <div className="portal-user" ref={menuRef}>
              <button type="button" className="portal-user-trigger" onClick={() => setMenuOpen((prev) => !prev)}>
                <span className="portal-avatar">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={displayName} />
                  ) : (
                    displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="portal-user-trigger-label">{displayName.split(' ')[0]}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                  style={{ transform: menuOpen ? 'rotate(180deg)' : 'none' }}
                >
                  <path d="M6 8L1 3h10z" />
                </svg>
              </button>

              {menuOpen && (
                <div className="portal-user-menu">
                  <div className="portal-user-menu-meta">
                    <strong>{displayName}</strong>
                    <span>{roleLabel}</span>
                  </div>

                  <Link to={accountSettingsPath} onClick={() => setMenuOpen(false)} className="portal-user-menu-item">
                    Account Settings
                  </Link>

                  <Link
                    to={role === 'campaign_manager' ? '/orgs/profile' : '/users/profile'}
                    onClick={() => setMenuOpen(false)}
                    className="portal-user-menu-item"
                  >
                    Profile
                  </Link>

                  <Link to="/contact-settings" onClick={() => setMenuOpen(false)} className="portal-user-menu-item">
                    Contact Page
                  </Link>

                  <a href={pidpUrl('/')} onClick={() => setMenuOpen(false)} className="portal-user-menu-item">
                    Identity (PIdP)
                  </a>

                  {isAdmin && (
                    <Link to="/admin" onClick={() => setMenuOpen(false)} className="portal-user-menu-item admin">
                      Admin
                    </Link>
                  )}

                  <button type="button" onClick={logout} className="portal-user-menu-item logout">
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <a className="portal-button" href={pidpAppLoginUrl(nextUrl)}>
                Log In
              </a>
              <Link to="/users/register" className="btn-secondary">
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
