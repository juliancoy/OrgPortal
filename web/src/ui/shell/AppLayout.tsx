import { Outlet } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'

export function AppLayout() {
  const location = useLocation()
  const hideHeader = /^\/(?:users|contact)\/[^/]+\/?$/.test(location.pathname)

  return (
    <div className="portal-shell">
      {hideHeader ? null : <Header />}
      <main className="portal-main">
        <div className="portal-container">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  )
}
