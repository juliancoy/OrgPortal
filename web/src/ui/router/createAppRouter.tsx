import { CommunitiesPage, PlatformHomePage } from '../views/PlatformHomePage'
import { resolveOrganizationView, useOrganizationAccess, useOrganizationViewPreference } from '../hooks/useOrganizationView'
import { PortalProfileBoundary } from '../shell/PortalProfileBoundary'
import { getDomainCommunity, getDomainTenant, type PortalTenant } from '../../config/timebankCommunity'
import { lazy, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Navigate, createBrowserRouter, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '../shell/AppLayout'
import { TimebankHeader } from '../shell/TimebankHeader'
import App from '../../App'
import { useAuth } from '../../app/AppProviders'
import { TimebankInboxProvider } from '../timebank/TimebankInbox'
import { TenantEventsContent, TenantEventsHomePage, TenantHomePage, TenantSlugHomePage } from '../views/TenantHomePage'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'
import { portalBasePath } from '../../config/portalBase'
import { getActivePortalProfileConfig, portalProfilePath, isPortalFeatureEnabled, type PortalFeature } from '../../config/portalFeatures'
import { tenantHomeAction } from '../../config/tenantHome'

const LocalNewslettersPage = lazy(() => import('../views/LocalNewslettersPage').then(module => ({ default: module.LocalNewslettersPage })))
const EcosystemNetworkPage = lazy(() => import('../views/EcosystemNetworkPage').then(module => ({ default: module.EcosystemNetworkPage })))
const SeriesAFundingGapPage = lazy(() => import('../views/SeriesAFundingGapPage').then(module => ({ default: module.SeriesAFundingGapPage })))
const EcosystemNetworkViews = lazy(() => import('../views/EcosystemNetworkViews').then(module => ({ default: module.EcosystemNetworkViews })))
const MemberMeetingsPage = lazy(() => import('../views/MemberMeetingsPage').then(module => ({ default: module.MemberMeetingsPage })))
const NametagsPage = lazy(() => import('../views/NametagsPage').then(module => ({ default: module.NametagsPage })))
const GovernanceDocumentPage = lazy(() => import('../views/governance/GovernanceDocumentPage').then(module => ({ default: module.GovernanceDocumentPage })))
const VenuesPage = lazy(() => import('../views/orgs/VenuesPage').then(module => ({ default: module.VenuesPage })))
const AvailabilityPage = lazy(() => import('../views/AvailabilityPage').then(module => ({ default: module.AvailabilityPage })))
const OnboardingPage = lazy(() => import('../views/OnboardingPage').then(module => ({ default: module.OnboardingPage })))
const EconomicOpsPage = lazy(() => import('../views/EconomicOpsPage').then(module => ({ default: module.EconomicOpsPage })))
const DepartmentsPage = lazy(() => import('../views/DepartmentsPage').then(module => ({ default: module.DepartmentsPage })))
const AuthCallbackPage = lazy(() => import('../views/AuthCallbackPage').then(module => ({ default: module.AuthCallbackPage })))
const InitiativeDetailPage = lazy(() => import('../views/InitiativeDetailPage').then(module => ({ default: module.InitiativeDetailPage })))
const InitiativeSignPage = lazy(() => import('../views/InitiativeSignPage').then(module => ({ default: module.InitiativeSignPage })))
const UserCalendarPage = lazy(() => import('../views/users/UserCalendarPage').then(module => ({ default: module.UserCalendarPage })))
const UserSettingsPage = lazy(() => import('../views/users/UserSettingsPage').then(module => ({ default: module.UserSettingsPage })))
const UserLoginPage = lazy(() => import('../views/users/UserLoginPage').then(module => ({ default: module.UserLoginPage })))
const McpConnectPage = lazy(() => import('../views/users/McpConnectPage').then(module => ({ default: module.McpConnectPage })))
const OrgLoginPage = lazy(() => import('../views/orgs/OrgLoginPage').then(module => ({ default: module.OrgLoginPage })))
const OrgRegisterPage = lazy(() => import('../views/orgs/OrgRegisterPage').then(module => ({ default: module.OrgRegisterPage })))
const OrgInitiativesPage = lazy(() => import('../views/orgs/OrgInitiativesPage').then(module => ({ default: module.OrgInitiativesPage })))
const OrgInitiativeEditorPage = lazy(() => import('../views/orgs/OrgInitiativeEditorPage').then(module => ({ default: module.OrgInitiativeEditorPage })))
const OrgInitiativeBallotPage = lazy(() => import('../views/orgs/OrgInitiativeBallotPage').then(module => ({ default: module.OrgInitiativeBallotPage })))
const OrgProfilePage = lazy(() => import('../views/orgs/OrgProfilePage').then(module => ({ default: module.OrgProfilePage })))
const OrgAccountPage = lazy(() => import('../views/orgs/OrgAccountPage').then(module => ({ default: module.OrgAccountPage })))
const OrgEventsPage = lazy(() => import('../views/orgs/OrgEventsPage').then(module => ({ default: module.OrgEventsPage })))
const PublicAdminPage = lazy(() => import('../views/public/PublicAdminPage').then(module => ({ default: module.PublicAdminPage })))
const PublicContactPage = lazy(() => import('../views/public/PublicContactPage').then(module => ({ default: module.PublicContactPage })))
const PublicEventsPage = lazy(() => import('../views/public/PublicEventsPage').then(module => ({ default: module.PublicEventsPage })))
const PublicCalendarPage = lazy(() => import('../views/public/PublicCalendarPage').then(module => ({ default: module.PublicCalendarPage })))
const PublicEventPage = lazy(() => import('../views/public/PublicEventPage').then(module => ({ default: module.PublicEventPage })))
const EmailCampaignsPage = lazy(() => import('../views/email/EmailCampaignsPage').then(module => ({ default: module.EmailCampaignsPage })))
const EmailPreferencesPage = lazy(() => import('../views/email/EmailPreferencesPage').then(module => ({ default: module.EmailPreferencesPage })))
const NotificationSettingsPage = lazy(() => import('../views/NotificationSettingsPage').then(module => ({ default: module.NotificationSettingsPage })))
const PublicOrganizationsPage = lazy(() => import('../views/public/PublicOrganizationsPage').then(module => ({ default: module.PublicOrganizationsPage })))
const GlobalSearchPage = lazy(() => import('../views/public/GlobalSearchPage').then(module => ({ default: module.GlobalSearchPage })))
const MotionListPage = lazy(() => import('../views/governance/MotionListPage').then(module => ({ default: module.MotionListPage })))
const MotionDetailPage = lazy(() => import('../views/governance/MotionDetailPage').then(module => ({ default: module.MotionDetailPage })))
const ProposeMotionPage = lazy(() => import('../views/governance/ProposeMotionPage').then(module => ({ default: module.ProposeMotionPage })))
const ProposeAmendmentPage = lazy(() => import('../views/governance/ProposeAmendmentPage').then(module => ({ default: module.ProposeAmendmentPage })))
const NotFoundPage = lazy(() => import('../views/NotFoundPage').then(module => ({ default: module.NotFoundPage })))
const AboutPage = lazy(() => import('../views/AboutPage').then(module => ({ default: module.AboutPage })))
const TermsPage = lazy(() => import('../views/TermsPage').then(module => ({ default: module.TermsPage })))
const AndroidInstallPage = lazy(() => import('../views/AndroidInstallPage').then(module => ({ default: module.AndroidInstallPage })))
const DashboardPage = lazy(() => import('../dashboard/DashboardPage').then(module => ({ default: module.DashboardPage })))
const AdminPage = lazy(() => import('../views/AdminPage').then(module => ({ default: module.AdminPage })))
const TargetPage = lazy(() => import('../views/TargetPage').then(module => ({ default: module.TargetPage })))
const OrgEditableInitiativesPage = lazy(() => import('../views/orgs/OrgEditableInitiativesPage').then(module => ({ default: module.OrgEditableInitiativesPage })))
const IdPage = lazy(() => import('../views/IdPage').then(module => ({ default: module.IdPage })))
const SendPage = lazy(() => import('../views/SendPage').then(module => ({ default: module.SendPage })))
const ReceivePage = lazy(() => import('../views/ReceivePage').then(module => ({ default: module.ReceivePage })))
const TimebankPage = lazy(() => import('../views/TimebankPage').then(module => ({ default: module.TimebankPage })))
const TenantResourcesPage = lazy(() => import('../views/TenantResourcesPage').then(module => ({ default: module.TenantResourcesPage })))
const TenantBrandingPage = lazy(() => import('../views/TenantBrandingPage').then(module => ({ default: module.TenantBrandingPage })))
const CreatePage = lazy(() => import('../views/CreatePage').then(module => ({ default: module.CreatePage })))
const CreateForProfitPage = lazy(() => import('../views/CreateForProfitPage').then(module => ({ default: module.CreateForProfitPage })))
const CreateNonProfitPage = lazy(() => import('../views/CreateNonProfitPage').then(module => ({ default: module.CreateNonProfitPage })))
const OrgChatPage = lazy(() => import('../views/chat/OrgChatPage').then(module => ({ default: module.OrgChatPage })))
const NativeChatPage = lazy(() => import('../views/chat/NativeChatPage').then(module => ({ default: module.NativeChatPage })))
const DevToolsPage = lazy(() => import('../views/DevToolsPage').then(module => ({ default: module.DevToolsPage })))
const BusinessCardIntakePage = lazy(() => import('../views/BusinessCardIntakePage').then(module => ({ default: module.BusinessCardIntakePage })))
const PeoplePage = lazy(() => import('../views/PeoplePage').then(module => ({ default: module.PeoplePage })))
const UbiSettingsPage = lazy(() => import('../views/UbiSettingsPage').then(module => ({ default: module.UbiSettingsPage })))
const LifeInsurancePage = lazy(() => import('../views/LifeInsurancePage').then(module => ({ default: module.LifeInsurancePage })))
const HealthInsurancePage = lazy(() => import('../views/HealthInsurancePage').then(module => ({ default: module.HealthInsurancePage })))
const ProviderSchedulingPage = lazy(() => import('../views/ProviderSchedulingPage').then(module => ({ default: module.ProviderSchedulingPage })))
const PropertyCasualtyInsurancePage = lazy(() => import('../views/PropertyCasualtyInsurancePage').then(module => ({ default: module.PropertyCasualtyInsurancePage })))

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

function tenantHomeElement(tenant: PortalTenant, role: string, profile: ReturnType<typeof getActivePortalProfileConfig>) {
  const action = tenantHomeAction(tenant, role, profile.memberHomePath)
  if (action.kind === 'landing') return <TenantHomePage />
  if (action.kind === 'events') return <TenantEventsHomePage />
  if (action.kind === 'timebank') return <TimebankTenantRoot />
  return <Navigate to={portalProfilePath(action.to, profile)} replace />
}

function HomeRoute() {
  const { role, isLoading } = useAuth()
  const tenant = getDomainTenant()
  const access = useOrganizationAccess(tenant?.home_org_slug)
  const location = useLocation()
  const requestedView = useOrganizationViewPreference(tenant?.home_org_slug, new URLSearchParams(location.search).get('view'))
  if (isLoading || access.loading) return null
  const profile = getActivePortalProfileConfig()
  if (profile.id === 'orgportal') return <PlatformHomePage />
  if (tenant?.home_org_slug && (access.organizer || requestedView)) {
    const view = resolveOrganizationView(requestedView, access.organizer, access.member)
    if (view === 'public') return <TenantHomePage />
    return <Navigate to={`/orgs/${encodeURIComponent(tenant.home_org_slug)}?view=${view}`} replace />
  }
  if (tenant) return tenantHomeElement(tenant, role, profile)
  if (getDomainCommunity()) return <Navigate to="/timebanking" replace />
  if (role === 'guest') return <App />
  return <Navigate to="/chat" replace />
}


function TimebankTenantRoot() {
  return <TimebankInboxProvider enabled><div className="portal-shell timebank-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <TimebankHeader />
    <main id="main-content" className="portal-main" tabIndex={-1}>
      <div className="portal-container">
        <TimebankPage />
      </div>
    </main>
    <footer className="tb-shell-footer">Timebank hours are separate from Dena.</footer>
  </div></TimebankInboxProvider>
}

function TenantOrgEventsRoute() {
  const tenant = getDomainTenant()
  if (tenant?.home_org_slug) return <TenantEventsContent />
  return <PublicEventsPage />
}

function TenantCommunityAliasRoute() {
  const tenant = getDomainTenant()
  if (tenant?.home_org_slug) return <Navigate to="/" replace />
  return <Navigate to={getActivePortalProfileConfig().id === 'orgportal' ? '/communities' : tenant ? '/people' : '/orgs'} replace />
}

function TenantEventsAliasRoute() {
  return <Navigate to={getDomainTenant() ? '/org-events' : '/events'} replace />
}

function PublicEventsRoute() {
  const tenant = getDomainTenant()
  if (tenant?.home_org_slug) return <TenantEventsContent />
  return <PublicEventsPage />
}


function TimebankRoute() {
  const { user } = useAuth()
  // Reset member data when identity changes, while keeping guest dialogs open
  // during background session checks.
  if (getActivePortalProfileConfig().id === 'orgportal') return <Navigate to="/communities?feature=timebank" replace />
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

function LoginRedirectRoute() {
  const location = useLocation()
  return <Navigate to={`/users/login${location.search}${location.hash}`} replace />
}

function ChatRoute() {
  const backend = ((import.meta.env.VITE_CHAT_BACKEND as string | undefined) || 'cloudflare').toLowerCase()
  if (backend === 'matrix') return <OrgChatPage />
  return <NativeChatPage />
}

function AdminRoute(props: { children: ReactElement }) {
  const location = useLocation()
  const { role, token, isLoading } = useAuth()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    if (isLoading) return
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
  }, [role, token, isLoading])

  if (isLoading || isAdmin === null) return null
  if (!isAdmin) return <section className="panel">
    <h1>{role === 'guest' ? 'Sign in required' : 'Access denied'}</h1>
    <p>This page requires system administrator access.</p>
    {role === 'guest' && <a href={`${portalBasePath()}/users/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</a>}
  </section>
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
      { path: '/portals/:tenantSlug', element: <TenantSlugHomePage /> },
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

          { path: '/org-events', element: <TenantOrgEventsRoute /> },
          { path: '/community', element: <TenantCommunityAliasRoute /> },
          { path: '/medtech-events', element: <TenantEventsAliasRoute /> },
          { path: '/ecosystem/network', element: <EcosystemNetworkPage /> },
          { path: '/ecosystem/network/events', element: <EcosystemNetworkViews view="events" /> },
          { path: '/ecosystem/network/relationships', element: <EcosystemNetworkViews view="relationships" /> },
          { path: '/ecosystem/network/funding', element: <SeriesAFundingGapPage /> },
          { path: '/ecosystem/network/help', element: <EcosystemNetworkViews view="help" /> },
          { path: '/resources', element: <TenantResourcesPage /> },
          { path: '/local/newsletters', element: <LocalNewslettersPage /> },
          { path: '/branding', element: <TenantBrandingPage /> },
          { path: '/branding.html', element: <Navigate to="/branding" replace /> },
          { path: '/communities', element: <CommunitiesPage /> },
          { path: '/about', element: <AboutPage /> },
          { path: '/terms', element: <TermsPage /> },
          { path: '/legal', element: <TermsPage /> },
          { path: '/email', element: <AdminRoute><EmailCampaignsPage /></AdminRoute> },
          { path: '/email/preferences', element: <AuthenticatedRoute><EmailPreferencesPage /></AuthenticatedRoute> },
          { path: '/settings/notifications', element: <AuthenticatedRoute><NotificationSettingsPage /></AuthenticatedRoute> },
          { path: '/android/install', element: <AndroidInstallPage /> },

          // Canonical user routes
          { path: '/users/register', element: <LoginRedirectRoute /> },
          { path: '/users/login', element: <UserLoginPage /> },
          { path: '/users/mcp-connect', element: <AuthenticatedRoute><McpConnectPage /></AuthenticatedRoute> },
          { path: '/users/dashboard', element: <DashboardPage /> },
          {
            path: '/profile',
            element: (
              <AuthenticatedRoute>
                <PublicContactPage self />
              </AuthenticatedRoute>
            ),
          },
          { path: '/calendar', element: <PublicCalendarPage /> },
          { path: '/calendar.html', element: <Navigate to="/calendar" replace /> },
          {
            path: '/calendar/integrations',
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
          { path: '/constituent/register', element: <LegacyUserRoute to="/users/login" /> },
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
          { path: '/orgs/events/venues', element: <VenuesPage /> },
          { path: '/orgs/events/venues/:id', element: <VenuesPage /> },
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
            path: '/admin/nametags',
            element: <AdminRoute><NametagsPage /></AdminRoute>,
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

          { path: '/meetings', element: <MemberMeetingsPage /> },
          { path: '/meetings/:host', element: <MemberMeetingsPage /> },
          { path: '/availability', element: <AvailabilityPage /> },
          { path: '/onboarding', element: <OnboardingPage /> },
          { path: '/availability/:id', element: <AvailabilityPage /> },
          { path: '/events', element: <PublicEventsRoute /> },
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
          { path: '/governance/documents/lifetech-constitution', element: <GovernanceDocumentPage /> },
          { path: '/governance/documents/lifetech-constitution/tickets/:ticketId', element: <GovernanceDocumentPage /> },
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
