import { Navigate } from 'react-router-dom'
import { getActivePortalProfileConfig } from '../../config/portalFeatures'
import { getDomainTenant } from '../../config/timebankCommunity'
import { specialtyResourcesForTenant } from '../../config/specialtyResources'
import { ExternalBrowserPrompt } from '../components/ExternalBrowserPrompt'
import { SpecialtyResourcesPanel } from '../components/SpecialtyResourcesPanel'
import { Footer } from '../shell/Footer'
import { Header } from '../shell/Header'

export function TenantResourcesPage() {
  const tenant = getDomainTenant()
  const profile = getActivePortalProfileConfig()
  const resources = specialtyResourcesForTenant(tenant)
  if (!tenant) return <Navigate to="/" replace />

  return <div className="portal-shell tenant-home-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <Header />
    <main id="main-content" className="portal-main tenant-home-main" tabIndex={-1}>
      <div className="portal-container">
        <ExternalBrowserPrompt />
        <section className="tenant-calendar-intro panel">
          <div>
            <p className="tenant-home-eyebrow">Resources</p>
            <h1>{profile.brandName} Resources</h1>
            <p className="portal-muted">Specialized maps, data workbooks, and research tools connected to this portal.</p>
          </div>
        </section>
        <SpecialtyResourcesPanel resources={resources} />
      </div>
    </main>
    <Footer />
  </div>
}
