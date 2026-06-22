import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { ExternalBrowserPrompt } from '../components/ExternalBrowserPrompt'

export function AppLayout() {
  const location = useLocation()
  const mainRef = useRef<HTMLElement | null>(null)
  const canonicalUserRoutes = new Set(['/profile', '/users/register', '/users/login', '/users/dashboard', '/users/profile', '/users/account'])
  const hideHeader =
    /^\/contact\/[^/]+\/?$/.test(location.pathname) ||
    (/^\/users\/[^/]+\/?$/.test(location.pathname) && !canonicalUserRoutes.has(location.pathname.replace(/\/$/, '')))
  const isChatRoute = location.pathname.startsWith('/chat')

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true })
  }, [location.pathname])

  return (
    <div className="portal-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {hideHeader ? null : <Header />}
      <main id="main-content" className="portal-main" ref={mainRef} tabIndex={-1}>
        <div className={`portal-container ${isChatRoute ? 'portal-chat-container' : ''}`}>
          <ExternalBrowserPrompt />
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  )
}
