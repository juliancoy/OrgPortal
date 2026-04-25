import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '../shell/AppLayout'
import App from '../../App'
import { EconomicOpsPage } from '../views/EconomicOpsPage'
import { AuthCallbackPage } from '../views/AuthCallbackPage'
import { InitiativeDetailPage } from '../views/InitiativeDetailPage'
import { InitiativeSignPage } from '../views/InitiativeSignPage'
import { ConstituentAccountPage } from '../views/constituent/ConstituentAccountPage'
import { ConstituentProfilePage } from '../views/constituent/ConstituentProfilePage'
import { ConstituentLoginPage } from '../views/constituent/ConstituentLoginPage'
import { ConstituentRegisterPage } from '../views/constituent/ConstituentRegisterPage'
import { CampaignLoginPage } from '../views/campaign/CampaignLoginPage'
import { CampaignRegisterPage } from '../views/campaign/CampaignRegisterPage'
import { CampaignInitiativesPage } from '../views/campaign/CampaignInitiativesPage'
import { CampaignInitiativeEditorPage } from '../views/campaign/CampaignInitiativeEditorPage'
import { CampaignInitiativeBallotPage } from '../views/campaign/CampaignInitiativeBallotPage'
import { CampaignProfilePage } from '../views/campaign/CampaignProfilePage'
import { CampaignAccountPage } from '../views/campaign/CampaignAccountPage'
import { CampaignEventsPage } from '../views/campaign/CampaignEventsPage'
import { PublicCampaignManagerPage } from '../views/public/PublicCampaignManagerPage'
import { PublicContactPage } from '../views/public/PublicContactPage'
import { PublicEventsPage } from '../views/public/PublicEventsPage'
import { PublicEventPage } from '../views/public/PublicEventPage'
import { MotionListPage } from '../views/governance/MotionListPage'
import { MotionDetailPage } from '../views/governance/MotionDetailPage'
import { ProposeMotionPage } from '../views/governance/ProposeMotionPage'
import { ProposeAmendmentPage } from '../views/governance/ProposeAmendmentPage'
import { NotFoundPage } from '../views/NotFoundPage'
import { AboutPage } from '../views/AboutPage'
import { DashboardPage } from '../dashboard/DashboardPage'
import { AdminPage } from '../views/AdminPage'
import { TargetPage } from '../views/TargetPage'
import { CampaignEditableInitiativesPage } from '../views/campaign/CampaignEditableInitiativesPage'
import { ContactSettingsPage } from '../views/ContactSettingsPage'
import { SendPage } from '../views/SendPage'
import { ReceivePage } from '../views/ReceivePage'
import { CreatePage } from '../views/CreatePage'
import { CreateForProfitPage } from '../views/CreateForProfitPage'
import { CreateNonProfitPage } from '../views/CreateNonProfitPage'

export function createAppRouter() {
  const baseUrl = import.meta.env.BASE_URL ?? '/'
  const basename = baseUrl === '/' ? '/' : baseUrl.replace(/\/$/, '')

  return createBrowserRouter(
    [
      { path: '/', element: <App /> },
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
          { path: '/users/register', element: <ConstituentRegisterPage /> },
          { path: '/users/login', element: <ConstituentLoginPage /> },
          { path: '/users/dashboard', element: <DashboardPage /> },
          { path: '/users/profile', element: <ConstituentProfilePage /> },
          { path: '/users/account', element: <ConstituentAccountPage /> },

          // Canonical org routes
          { path: '/orgs/register', element: <CampaignRegisterPage /> },
          { path: '/orgs/login', element: <CampaignLoginPage /> },
          { path: '/orgs/initiatives', element: <CampaignInitiativesPage /> },
          { path: '/orgs/initiatives/editable', element: <CampaignEditableInitiativesPage /> },
          { path: '/orgs/initiatives/new', element: <CampaignInitiativeEditorPage /> },
          { path: '/orgs/initiatives/:id/edit', element: <CampaignInitiativeEditorPage /> },
          { path: '/orgs/initiatives/:id/ballot', element: <CampaignInitiativeBallotPage /> },
          { path: '/orgs/profile', element: <CampaignProfilePage /> },
          { path: '/orgs/account', element: <CampaignAccountPage /> },
          { path: '/orgs/events', element: <CampaignEventsPage /> },
          { path: '/admin', element: <AdminPage /> },
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
          { path: '/campaign/initiatives/:id/edit', element: <CampaignInitiativeEditorPage /> },
          { path: '/campaign/initiatives/:id/ballot', element: <CampaignInitiativeBallotPage /> },
          { path: '/campaign/profile', element: <Navigate to="/orgs/profile" replace /> },
          { path: '/campaign/account', element: <Navigate to="/orgs/account" replace /> },
          { path: '/campaign/events', element: <Navigate to="/orgs/events" replace /> },
          { path: '/campaign-managers/:handle', element: <PublicCampaignManagerPage /> },
          { path: '/events', element: <PublicEventsPage /> },
          { path: '/events/:slug', element: <PublicEventPage /> },

          // Public profile
          { path: '/orgs/:handle', element: <PublicCampaignManagerPage /> },
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
