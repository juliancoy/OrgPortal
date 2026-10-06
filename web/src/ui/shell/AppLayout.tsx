import { TimebankInboxProvider } from '../timebank/TimebankInbox'
import { TimebankHeader } from './TimebankHeader'
import { useDomainCommunity } from '../../config/timebankCommunity'
import { getActivePortalProfileConfig } from '../../config/portalFeatures'
import { Suspense, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { ExternalBrowserPrompt } from '../components/ExternalBrowserPrompt'
import { FloatingSocialDock } from '../components/FloatingSocialDock'
import { OnboardingBanner } from '../views/OnboardingPage'

export function AppLayout() {
  const location = useLocation()
  const community = useDomainCommunity()
  const timebankShell = Boolean(community) || location.pathname.startsWith('/timebanking')
  const brandedAuth = Boolean(getActivePortalProfileConfig().tenantId) && ['/users/login', '/users/register'].includes(location.pathname)
  const mainRef = useRef<HTMLElement | null>(null)
  const canonicalUserRoutes = new Set(['/profile', '/users/register', '/users/login', '/users/dashboard', '/users/profile', '/users/account'])
  const hideHeader =
    /^\/contact\/[^/]+\/?$/.test(location.pathname) ||
    (/^\/users\/[^/]+\/?$/.test(location.pathname) && !canonicalUserRoutes.has(location.pathname.replace(/\/$/, '')))
  const isChatRoute = location.pathname.startsWith('/chat')
  const embeddedChat = isChatRoute && window.self !== window.top

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true })
  }, [location.pathname])

  return (
    <TimebankInboxProvider enabled={timebankShell}><div className={`portal-shell ${timebankShell ? 'timebank-shell' : ''} ${brandedAuth ? 'portal-tenant-auth-shell' : ''} ${embeddedChat ? 'portal-embedded-chat' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {embeddedChat ? null : timebankShell ? <TimebankHeader /> : hideHeader ? null : <Header />}
      <main id="main-content" className="portal-main" ref={mainRef} tabIndex={-1}>
        <div className={`portal-container ${isChatRoute ? 'portal-chat-container' : ''}`}>
          {!timebankShell && !embeddedChat && <ExternalBrowserPrompt />}
          {!embeddedChat && location.pathname !== '/onboarding' && <OnboardingBanner />}
          <Suspense fallback={<p role="status">Loading page…</p>}><Outlet /></Suspense>
        </div>
      </main>
      {embeddedChat ? null : timebankShell ? <footer className="tb-shell-footer">Timebank hours are separate from Dena.</footer> : <Footer />}
      {!embeddedChat && <FloatingSocialDock />}
    </div></TimebankInboxProvider>
  )
}
