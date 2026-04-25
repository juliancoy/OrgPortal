import { Link, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/AppProviders'
import { pidpUrl } from '../../config/pidp'

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

export function Header() {
  const { role, user, logout, token } = useAuth()
  const location = useLocation()
  const displayName = user?.displayName || user?.email || 'Signed in'
  const accountSettingsPath = role === 'campaign_manager' ? '/orgs/account' : '/users/account'
  const roleLabel = role === 'campaign_manager' ? 'Org' : role === 'constituent' ? 'User' : 'Guest'
  const nextUrl = window.location.href
  const [menuOpen, setMenuOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

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
  }, [location.pathname])

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

  const isCivicActive =
    location.pathname === '/' ||
    location.pathname.startsWith('/events') ||
    location.pathname.startsWith('/governance') ||
    location.pathname.startsWith('/users') ||
    location.pathname.startsWith('/orgs') ||
    location.pathname.startsWith('/constituent') ||
    location.pathname.startsWith('/campaign') ||
    location.pathname.startsWith('/about') ||
    location.pathname.startsWith('/initiatives')

  const isFinanceActive =
    location.pathname.startsWith('/ecops') ||
    location.pathname.startsWith('/send') ||
    location.pathname.startsWith('/receive') ||
    location.pathname.startsWith('/create')

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

        <div className="portal-auth">
          {role !== 'guest' ? (
            <div className="portal-user" ref={menuRef}>
              <button type="button" className="portal-user-trigger" onClick={() => setMenuOpen((prev) => !prev)}>
                <span className="portal-avatar">
                  {user?.avatarUrl ? <img src={user.avatarUrl} alt={displayName} /> : displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="portal-user-trigger-label">{displayName.split(' ')[0]}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ transform: menuOpen ? 'rotate(180deg)' : 'none' }}>
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
              <a className="portal-button" href={pidpUrl(`/login?next=${encodeURIComponent(nextUrl)}`)}>
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
