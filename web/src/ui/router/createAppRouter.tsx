import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '../shell/AppLayout'
import App from '../../App'
import { useAuth } from '../../app/AppProviders'
import { EconomicOpsPage } from '../views/EconomicOpsPage'
import { AuthCallbackPage } from '../views/AuthCallbackPage'
import { InitiativeDetailPage } from '../views/InitiativeDetailPage'
import { InitiativeSignPage } from '../views/InitiativeSignPage'
import { UserAccountPage } from '../views/constituent/ConstituentAccountPage'
import { UserProfilePage } from '../views/constituent/ConstituentProfilePage'
import { UserLoginPage } from '../views/constituent/ConstituentLoginPage'
import { UserRegisterPage } from '../views/constituent/ConstituentRegisterPage'
import { OrgLoginPage } from '../views/campaign/OrgLoginPage'
import { OrgRegisterPage } from '../views/campaign/OrgRegisterPage'
import { OrgInitiativesPage } from '../views/campaign/OrgInitiativesPage'
import { OrgInitiativeEditorPage } from '../views/campaign/OrgInitiativeEditorPage'
import { OrgInitiativeBallotPage } from '../views/campaign/OrgInitiativeBallotPage'
import { OrgProfilePage } from '../views/campaign/OrgProfilePage'
import { OrgAccountPage } from '../views/campaign/OrgAccountPage'
import { OrgEventsPage } from '../views/campaign/OrgEventsPage'
import { PublicAdminPage } from '../views/public/PublicAdminPage'
import { PublicContactPage } from '../views/public/PublicContactPage'
import { PublicEventsPage } from '../views/public/PublicEventsPage'
import { PublicEventPage } from '../views/public/PublicEventPage'
import { PublicOrganizationsPage } from '../views/public/PublicOrganizationsPage'
import { GlobalSearchPage } from '../views/public/GlobalSearchPage'
import { MotionListPage } from '../views/governance/MotionListPage'
import { MotionDetailPage } from '../views/governance/MotionDetailPage'
import { ProposeMotionPage } from '../views/governance/ProposeMotionPage'
import { ProposeAmendmentPage } from '../views/governance/ProposeAmendmentPage'
import { NotFoundPage } from '../views/NotFoundPage'
import { AboutPage } from '../views/AboutPage'
import { DashboardPage } from '../dashboard/DashboardPage'
import { AdminPage } from '../views/AdminPage'
import { TargetPage } from '../views/TargetPage'
import { OrgEditableInitiativesPage } from '../views/campaign/OrgEditableInitiativesPage'
import { ContactSettingsPage } from '../views/ContactSettingsPage'
import { SendPage } from '../views/SendPage'
import { ReceivePage } from '../views/ReceivePage'
import { CreatePage } from '../views/CreatePage'
import { CreateForProfitPage } from '../views/CreateForProfitPage'
import { CreateNonProfitPage } from '../views/CreateNonProfitPage'
import { OrgChatPage } from '../views/chat/OrgChatPage'
import { DevToolsPage } from '../views/DevToolsPage'
import { BusinessCardIntakePage } from '../views/BusinessCardIntakePage'
import { PeoplePage } from '../views/PeoplePage'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'

function AuthenticatedRoute(props: { children: ReactElement }) {
  const { role, isLoading } = useAuth()
  if (isLoading) return null
  if (role === 'guest') return <Navigate to="/" replace />
  return props.children
}

function HomeRoute() {
  const { role, isLoading } = useAuth()
  if (isLoading) return null
  if (role === 'guest') return <App />
  return <Navigate to="/chat" replace />
}

function AdminRoute(props: { children: ReactElement }) {
  const { role, token } = useAuth()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    if (role === 'guest' || !token) {
      setIsAdmin(false)
      return
    }
    let cancelled = false
    const checkAdmin = async () => {
      let response = await fetch('/api/org/admin/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.status === 401) {
        const refreshed = await refreshRuntimeTokenFromSession()
        if (refreshed) {
          response = await fetch('/api/org/admin/me', {
            headers: { Authorization: `Bearer ${refreshed}` },
          })
        }
      }
      return response.ok ? response.json() : { is_sysadmin: false }
    }

    checkAdmin()
      .then((data) => {
        if (!cancelled) setIsAdmin(Boolean(data.is_sysadmin))
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false)
      })
    return () => {
      cancelled = true
    }
  }, [role, token])

  if (isAdmin === null) return null
  if (!isAdmin) return <Navigate to="/" replace />
  return props.children
}

export function createAppRouter() {
  const baseUrl = import.meta.env.BASE_URL ?? '/'
  const basename = baseUrl === '/' ? '/' : baseUrl.replace(/\/$/, '')

  return createBrowserRouter(
    [
      { path: '/', element: <HomeRoute /> },
      { path: '/ecops', element: <EconomicOpsPage /> },
      { path: '/send', element: <SendPage /> },
      { path: '/receive', element: <ReceivePage /> },
      { path: '/create', element: <CreatePage /> },
      { path: '/create/for-profit', element: <CreateForProfitPage /> },
      { path: '/create/non-profit', element: <CreateNonProfitPage /> },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      // If someone hits the physical file path in S3/CloudFront, redirect to the SPA root.
      { path: '/index.html', element: <Navigate to="/" replace /> },
      {
        element: <AppLayout />,
        children: [
          { path: '/initiatives/:slug', element: <InitiativeDetailPage /> },
          { path: '/initiatives/:slug/sign', element: <InitiativeSignPage /> },

          { path: '/about', element: <AboutPage /> },

          // Canonical user routes
          { path: '/users/register', element: <UserRegisterPage /> },
          { path: '/users/login', element: <UserLoginPage /> },
          { path: '/users/dashboard', element: <DashboardPage /> },
          { path: '/users/profile', element: <UserProfilePage /> },
          { path: '/users/account', element: <UserAccountPage /> },

          // Canonical org routes
          { path: '/orgs/register', element: <OrgRegisterPage /> },
          { path: '/orgs/login', element: <OrgLoginPage /> },
          { path: '/orgs/initiatives', element: <OrgInitiativesPage /> },
          { path: '/orgs/initiatives/editable', element: <OrgEditableInitiativesPage /> },
          { path: '/orgs/initiatives/new', element: <OrgInitiativeEditorPage /> },
          { path: '/orgs/initiatives/:id/edit', element: <OrgInitiativeEditorPage /> },
          { path: '/orgs/initiatives/:id/ballot', element: <OrgInitiativeBallotPage /> },
          { path: '/orgs/profile', element: <OrgProfilePage /> },
          { path: '/orgs/account', element: <OrgAccountPage /> },
          { path: '/orgs/events', element: <OrgEventsPage /> },
          {
            path: '/chat',
            element: (
              <AuthenticatedRoute>
                <OrgChatPage />
              </AuthenticatedRoute>
            ),
          },
          {
            path: '/chat/:roomId',
            element: (
              <AuthenticatedRoute>
                <OrgChatPage />
              </AuthenticatedRoute>
            ),
          },
          {
            path: '/dev-tools',
            element: (
              <AuthenticatedRoute>
                <DevToolsPage />
              </AuthenticatedRoute>
            ),
          },
          {
            path: '/tools/business-cards',
            element: <BusinessCardIntakePage />,
          },
          {
            path: '/admin',
            element: (
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
            ),
          },
          { path: '/targets/:target', element: <TargetPage /> },

          // Legacy route compatibility
          { path: '/constituent/register', element: <Navigate to="/users/register" replace /> },
          { path: '/constituent/login', element: <Navigate to="/users/login" replace /> },
          { path: '/constituent/dashboard', element: <Navigate to="/users/dashboard" replace /> },
          { path: '/constituent/profile', element: <Navigate to="/users/profile" replace /> },
          { path: '/constituent/account', element: <Navigate to="/users/account" replace /> },
          { path: '/campaign/register', element: <Navigate to="/orgs/register" replace /> },
          { path: '/campaign/login', element: <Navigate to="/orgs/login" replace /> },
          { path: '/campaign/initiatives', element: <Navigate to="/orgs/initiatives" replace /> },
          { path: '/campaign/initiatives/editable', element: <Navigate to="/orgs/initiatives/editable" replace /> },
          { path: '/campaign/initiatives/new', element: <Navigate to="/orgs/initiatives/new" replace /> },
          { path: '/campaign/initiatives/:id/edit', element: <OrgInitiativeEditorPage /> },
          { path: '/campaign/initiatives/:id/ballot', element: <OrgInitiativeBallotPage /> },
          { path: '/campaign/profile', element: <Navigate to="/orgs/profile" replace /> },
          { path: '/campaign/account', element: <Navigate to="/orgs/account" replace /> },
          { path: '/campaign/events', element: <Navigate to="/orgs/events" replace /> },
          { path: '/campaign-managers/:handle', element: <PublicAdminPage /> },
          { path: '/events', element: <PublicEventsPage /> },
          { path: '/events/:slug', element: <PublicEventPage /> },
          { path: '/orgs', element: <PublicOrganizationsPage /> },
          { path: '/people', element: <PeoplePage /> },
          { path: '/search', element: <GlobalSearchPage /> },

          // Public profile
          { path: '/orgs/:handle', element: <PublicAdminPage /> },
          { path: '/users/:slug', element: <PublicContactPage /> },
          { path: '/contact/:slug', element: <PublicContactPage /> },
          { path: '/contact-settings', element: <ContactSettingsPage /> },

          // Governance
          { path: '/governance', element: <MotionListPage /> },
          { path: '/governance/propose', element: <ProposeMotionPage /> },
          { path: '/governance/:id', element: <MotionDetailPage /> },
          { path: '/governance/:id/amend', element: <ProposeAmendmentPage /> },

          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
    { basename },
  )
}
