import { PortalProfileBoundary } from '../shell/PortalProfileBoundary'
import { MedTechCommunityPage } from '../views/MedTechCommunityPage'
import { MedTechEventsPage } from '../views/MedTechEventsPage'
import { getDomainCommunity } from '../../config/timebankCommunity'
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Navigate, createBrowserRouter, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '../shell/AppLayout'
import App from '../../App'
import { useAuth } from '../../app/AppProviders'
import { EconomicOpsPage } from '../views/EconomicOpsPage'
import { DepartmentsPage } from '../views/DepartmentsPage'
import { AuthCallbackPage } from '../views/AuthCallbackPage'
import { InitiativeDetailPage } from '../views/InitiativeDetailPage'
import { InitiativeSignPage } from '../views/InitiativeSignPage'
import { UserProfilePage } from '../views/users/UserProfilePage'
import { UserCalendarPage } from '../views/users/UserCalendarPage'
import { UserSettingsPage } from '../views/users/UserSettingsPage'
import { UserLoginPage } from '../views/users/UserLoginPage'
import { UserRegisterPage } from '../views/users/UserRegisterPage'
import { OrgLoginPage } from '../views/orgs/OrgLoginPage'
import { OrgRegisterPage } from '../views/orgs/OrgRegisterPage'
import { OrgInitiativesPage } from '../views/orgs/OrgInitiativesPage'
import { OrgInitiativeEditorPage } from '../views/orgs/OrgInitiativeEditorPage'
import { OrgInitiativeBallotPage } from '../views/orgs/OrgInitiativeBallotPage'
import { OrgProfilePage } from '../views/orgs/OrgProfilePage'
import { OrgAccountPage } from '../views/orgs/OrgAccountPage'
import { OrgEventsPage } from '../views/orgs/OrgEventsPage'
import { PublicAdminPage } from '../views/public/PublicAdminPage'
import { PublicContactPage } from '../views/public/PublicContactPage'
import { PublicEventsPage } from '../views/public/PublicEventsPage'
import { PublicEventPage } from '../views/public/PublicEventPage'
import { EmailCampaignsPage } from '../views/email/EmailCampaignsPage'
import { EmailPreferencesPage } from '../views/email/EmailPreferencesPage'
import { PublicOrganizationsPage } from '../views/public/PublicOrganizationsPage'
import { GlobalSearchPage } from '../views/public/GlobalSearchPage'
import { MotionListPage } from '../views/governance/MotionListPage'
import { MotionDetailPage } from '../views/governance/MotionDetailPage'
import { ProposeMotionPage } from '../views/governance/ProposeMotionPage'
import { ProposeAmendmentPage } from '../views/governance/ProposeAmendmentPage'
import { NotFoundPage } from '../views/NotFoundPage'
import { AboutPage } from '../views/AboutPage'
import { AndroidInstallPage } from '../views/AndroidInstallPage'
import { DashboardPage } from '../dashboard/DashboardPage'
import { AdminPage } from '../views/AdminPage'
import { TargetPage } from '../views/TargetPage'
import { OrgEditableInitiativesPage } from '../views/orgs/OrgEditableInitiativesPage'
import { IdPage } from '../views/IdPage'
import { SendPage } from '../views/SendPage'
import { ReceivePage } from '../views/ReceivePage'
import { TimebankPage } from '../views/TimebankPage'
import { CreatePage } from '../views/CreatePage'
import { CreateForProfitPage } from '../views/CreateForProfitPage'
import { CreateNonProfitPage } from '../views/CreateNonProfitPage'
import { OrgChatPage } from '../views/chat/OrgChatPage'
import { NativeChatPage } from '../views/chat/NativeChatPage'
import { DevToolsPage } from '../views/DevToolsPage'
import { BusinessCardIntakePage } from '../views/BusinessCardIntakePage'
import { PeoplePage } from '../views/PeoplePage'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'
import { UbiSettingsPage } from '../views/UbiSettingsPage'
import { LifeInsurancePage } from '../views/LifeInsurancePage'
import { HealthInsurancePage } from '../views/HealthInsurancePage'
import { ProviderSchedulingPage } from '../views/ProviderSchedulingPage'
import { PropertyCasualtyInsurancePage } from '../views/PropertyCasualtyInsurancePage'
import { portalBasePath } from '../../config/portalBase'
import { getActivePortalProfileConfig, portalProfilePath, isPortalFeatureEnabled, type PortalFeature } from '../../config/portalFeatures'

function AuthenticatedRoute(props: { children: ReactElement }) {
  const { role, isLoading } = useAuth()
  const location = useLocation()
  // Keep an authenticated page mounted during background session refreshes,
  // including the focus event when a member returns from a file picker.
  if (isLoading && role === 'guest') return null
  if (role === 'guest') {
    const next = `${location.pathname}${location.search}${location.hash}` || '/'
    return <Navigate to={portalProfilePath(`/users/login?next=${encodeURIComponent(next)}`)} replace />
  }
  return props.children
}

function HomeRoute() {
  const { role, isLoading } = useAuth()
  if (isLoading) return null
  if (getDomainCommunity()) return <Navigate to="/timebanking" replace />
  const profile = getActivePortalProfileConfig()
  if (profile.id === 'baltimore-medtech') {
    return <Navigate to={portalProfilePath(role === 'guest' ? '/users/login' : profile.memberHomePath)} replace />
  }
  if (role === 'guest') return <App />
  return <Navigate to="/chat" replace />
}

function TimebankRoute() {
  const { user } = useAuth()
  // Reset member data when identity changes, while keeping guest dialogs open
  // during background session checks.
  return <TimebankPage key={user?.id || 'guest'} />
}

function LegacyUserRoute(props: { to: string }) {
  const navigate = useNavigate()

  useEffect(() => {
    navigate(props.to, { replace: true })
  }, [navigate, props.to])

  return null
}

function LegacyPublicContactRoute() {
  const { slug } = useParams()
  return <Navigate to={`/users/${encodeURIComponent(String(slug || ''))}`} replace />
}

function ChatRoute() {
  const backend = ((import.meta.env.VITE_CHAT_BACKEND as string | undefined) || 'cloudflare').toLowerCase()
  if (backend === 'matrix') return <OrgChatPage />
  return <NativeChatPage />
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

function FeatureRoute(props: { feature: PortalFeature; children: ReactElement }) {
  if (!isPortalFeatureEnabled(props.feature)) return <NotFoundPage />
  return props.children
}

export function createAppRouter() {
  const basename = portalBasePath() || '/'

  return createBrowserRouter(
    [{ element: <PortalProfileBoundary />, children: [
      { path: '/', element: <HomeRoute /> },
      { path: '/finance', element: <EconomicOpsPage /> },
      { path: '/departments', element: <DepartmentsPage /> },
      { path: '/ecops', element: <Navigate to="/finance" replace /> },
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

          { path: '/community', element: <MedTechCommunityPage /> },
          { path: '/medtech-events', element: <MedTechEventsPage /> },
          { path: '/about', element: <AboutPage /> },
          { path: '/email', element: <AdminRoute><EmailCampaignsPage /></AdminRoute> },
          { path: '/email/preferences', element: <AuthenticatedRoute><EmailPreferencesPage /></AuthenticatedRoute> },
          { path: '/android/install', element: <AndroidInstallPage /> },

          // Canonical user routes
          { path: '/users/register', element: <UserRegisterPage /> },
          { path: '/users/login', element: <UserLoginPage /> },
          { path: '/users/dashboard', element: <DashboardPage /> },
          { path: '/profile', element: <UserProfilePage /> },
          {
            path: '/calendar',
            element: (
              <AuthenticatedRoute>
                <UserCalendarPage />
              </AuthenticatedRoute>
            ),
          },
          {
            path: '/settings',
            element: (
              <AuthenticatedRoute>
                <UserSettingsPage />
              </AuthenticatedRoute>
            ),
          },
          { path: '/users/profile', element: <LegacyUserRoute to="/profile" /> },
          { path: '/users/account', element: <LegacyUserRoute to="/profile" /> },
          { path: '/constituent', element: <LegacyUserRoute to="/users/dashboard" /> },
          { path: '/constituent/dashboard', element: <LegacyUserRoute to="/users/dashboard" /> },
          { path: '/constituent/profile', element: <LegacyUserRoute to="/profile" /> },
          { path: '/constituent/account', element: <LegacyUserRoute to="/profile" /> },
          { path: '/constituent/login', element: <LegacyUserRoute to="/users/login" /> },
          { path: '/constituent/register', element: <LegacyUserRoute to="/users/register" /> },
          {
            path: '/id',
            element: (
              <AuthenticatedRoute>
                <IdPage />
              </AuthenticatedRoute>
            ),
          },

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
                <ChatRoute />
              </AuthenticatedRoute>
            ),
          },
          {
            path: '/chat/:roomId',
            element: (
              <AuthenticatedRoute>
                <ChatRoute />
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
          {
            path: '/admin/ubi-settings',
            element: (
              <FeatureRoute feature="ubi">
                <AdminRoute>
                  <UbiSettingsPage />
                </AdminRoute>
              </FeatureRoute>
            ),
          },
          { path: '/targets/:target', element: <TargetPage /> },

          { path: '/events', element: <PublicEventsPage /> },
          { path: '/events/:slug', element: <PublicEventPage /> },
          { path: '/orgs', element: <PublicOrganizationsPage /> },
          { path: '/people', element: <PeoplePage /> },
          { path: '/timebanking', element: <TimebankRoute /> },
          {
            path: '/life-insurance',
            element: (
              <AuthenticatedRoute>
                <LifeInsurancePage />
              </AuthenticatedRoute>
            ),
          },
          {
            path: '/health-insurance',
            element: (
              <AuthenticatedRoute>
                <HealthInsurancePage />
              </AuthenticatedRoute>
            ),
          },
          {
            path: '/provider-scheduling',
            element: (
              <AuthenticatedRoute>
                <ProviderSchedulingPage />
              </AuthenticatedRoute>
            ),
          },
          {
            path: '/property-casualty-insurance',
            element: (
              <AuthenticatedRoute>
                <PropertyCasualtyInsurancePage />
              </AuthenticatedRoute>
            ),
          },
          { path: '/search', element: <GlobalSearchPage /> },

          // Public profile
          { path: '/orgs/:handle', element: <PublicAdminPage /> },
          { path: '/users/:slug', element: <PublicContactPage /> },
          { path: '/contact/:slug', element: <LegacyPublicContactRoute /> },
          { path: '/contact-settings', element: <LegacyUserRoute to="/profile" /> },

          // Governance
          { path: '/governance/roberts', element: <MotionListPage /> },
          { path: '/governance/roberts/propose', element: <ProposeMotionPage /> },
          { path: '/governance/roberts/:id', element: <MotionDetailPage /> },
          { path: '/governance/roberts/:id/amend', element: <ProposeAmendmentPage /> },
          { path: '/governance', element: <MotionListPage /> },
          { path: '/governance/propose', element: <ProposeMotionPage /> },
          { path: '/governance/:id', element: <MotionDetailPage /> },
          { path: '/governance/:id/amend', element: <ProposeAmendmentPage /> },

          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ] }],
    { basename },
  )
}
