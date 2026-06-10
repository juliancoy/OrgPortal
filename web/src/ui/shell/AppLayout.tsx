import { Outlet } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'

export function AppLayout() {
  const location = useLocation()
  const canonicalUserRoutes = new Set(['/profile', '/users/register', '/users/login', '/users/dashboard', '/users/profile', '/users/account'])
  const hideHeader =
    /^\/contact\/[^/]+\/?$/.test(location.pathname) ||
    (/^\/users\/[^/]+\/?$/.test(location.pathname) && !canonicalUserRoutes.has(location.pathname.replace(/\/$/, '')))
  const isChatRoute = location.pathname.startsWith('/chat')

  return (
    <div className="portal-shell">
      {hideHeader ? null : <Header />}
      <main className="portal-main">
        <div className={`portal-container ${isChatRoute ? 'portal-chat-container' : ''}`}>
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  )
}
